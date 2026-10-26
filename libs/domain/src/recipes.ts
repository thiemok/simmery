import {
  ingredients,
  recipeLines,
  recipeSteps,
  recipeTags,
  recipes,
  type Database,
} from '@simmery/db';
import { normalize, unitKey, type IngredientUnits } from '@simmery/units';
import {
  and,
  asc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  escapeLike,
  insertIngredient,
  loadIngredients,
  prepareIngredient,
  type IngredientInput,
  type PreparedIngredient,
} from './catalog.js';
import {
  NotFoundError,
  UnresolvedUnitsError,
  isUuid,
  throwIfIssues,
  type FieldIssue,
  type UnresolvedLine,
} from './errors.js';

/** A line references an existing catalog ingredient, or creates one in the same save. */
export type RecipeLineInput = (
  | { ingredientId: string; newIngredient?: never }
  | { newIngredient: IngredientInput; ingredientId?: never }
) & {
  amount: number;
  unit: string;
  note?: string | null;
};

export interface RecipeInput {
  title: string;
  servings: number;
  lines: readonly RecipeLineInput[];
  steps: readonly string[];
  tags: readonly string[];
  /** Absolute `http` or `https` URL. */
  sourceUrl?: string | null;
}

export interface RecipeLine {
  ingredientId: string;
  ingredientName: string;
  amount: number;
  unit: string;
  canonicalAmount: number;
  canonicalUnit: string;
  note: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  sourceUrl: string | null;
  /** Set when the recipe was deleted; it stays readable and can be restored. */
  archivedAt: Date | null;
  lines: RecipeLine[];
  steps: string[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeSummary {
  id: string;
  title: string;
  servings: number;
  tags: string[];
}

interface PreparedLine {
  ingredient: { id: string } | { create: PreparedIngredient };
  amount: number;
  unit: string;
  canonicalAmount: number;
  note: string | null;
}

interface PreparedRecipe {
  title: string;
  servings: number;
  sourceUrl: string | null;
  lines: PreparedLine[];
  steps: string[];
  tags: string[];
}

function prepareSourceUrl(raw: string | null | undefined, issues: FieldIssue[]): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  const protocol = URL.canParse(value) ? new URL(value).protocol : undefined;
  if (protocol !== 'http:' && protocol !== 'https:') {
    issues.push({ field: 'sourceUrl', message: 'must be an absolute http or https URL' });
  }
  return value;
}

async function prepareRecipe(
  db: Database,
  userId: string,
  input: RecipeInput,
): Promise<PreparedRecipe> {
  const issues: FieldIssue[] = [];
  const title = input.title.trim();
  if (!title) {
    issues.push({ field: 'title', message: 'must not be empty' });
  }
  if (!Number.isInteger(input.servings) || input.servings < 1) {
    issues.push({ field: 'servings', message: 'must be a positive whole number' });
  }

  const newIngredients = new Map<number, PreparedIngredient>();
  input.lines.forEach((line, index) => {
    if (!Number.isFinite(line.amount) || line.amount < 0) {
      issues.push({ field: `lines[${index}].amount`, message: 'must be a non-negative number' });
    }
    if (!unitKey(line.unit)) {
      issues.push({ field: `lines[${index}].unit`, message: 'must not be empty' });
    }
    if (line.newIngredient) {
      const prepared = prepareIngredient(line.newIngredient, `lines[${index}].newIngredient.`);
      issues.push(...prepared.issues);
      newIngredients.set(index, prepared.ingredient);
    }
  });

  const steps = input.steps.map((step) => step.trim());
  steps.forEach((step, index) => {
    if (!step) {
      issues.push({ field: `steps[${index}]`, message: 'must not be empty' });
    }
  });
  const tags = [...new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  const sourceUrl = prepareSourceUrl(input.sourceUrl, issues);
  throwIfIssues(issues);

  const referencedIds = input.lines.flatMap((line) =>
    line.ingredientId ? [line.ingredientId] : [],
  );
  const owned = await loadIngredients(db, userId, referencedIds);
  const missing = referencedIds.find((id) => !owned.has(id));
  if (missing) {
    throw new NotFoundError('ingredient', missing);
  }

  const unresolved: UnresolvedLine[] = [];
  const lines = input.lines.map((line, index): PreparedLine => {
    const created = newIngredients.get(index);
    const units: IngredientUnits = created ?? owned.get(line.ingredientId!)!;
    const result = normalize(line.amount, line.unit, units);
    if (!result.resolved) {
      unresolved.push({ index, unit: result.unit });
    }
    return {
      ingredient: created ? { create: created } : { id: line.ingredientId! },
      amount: line.amount,
      unit: unitKey(line.unit),
      canonicalAmount: result.resolved ? result.amount : 0,
      note: line.note?.trim() || null,
    };
  });
  if (unresolved.length > 0) {
    throw new UnresolvedUnitsError(unresolved);
  }

  return { title, servings: input.servings, sourceUrl, lines, steps, tags };
}

async function writeChildren(
  db: Database,
  userId: string,
  recipeId: string,
  recipe: PreparedRecipe,
): Promise<void> {
  const lines = [];
  for (const [position, line] of recipe.lines.entries()) {
    const ingredientId =
      'id' in line.ingredient
        ? line.ingredient.id
        : await insertIngredient(db, userId, line.ingredient.create);
    const { amount, unit, canonicalAmount, note } = line;
    lines.push({ userId, recipeId, position, ingredientId, amount, unit, canonicalAmount, note });
  }
  if (lines.length > 0) {
    await db.insert(recipeLines).values(lines);
  }
  if (recipe.steps.length > 0) {
    await db
      .insert(recipeSteps)
      .values(recipe.steps.map((text, position) => ({ userId, recipeId, position, text })));
  }
  if (recipe.tags.length > 0) {
    await db.insert(recipeTags).values(recipe.tags.map((tag) => ({ userId, recipeId, tag })));
  }
}

/** Saves a whole recipe; any unresolved line unit refuses the save with an `UnresolvedUnitsError`. */
export async function createRecipe(
  db: Database,
  userId: string,
  input: RecipeInput,
): Promise<Recipe> {
  const recipe = await prepareRecipe(db, userId, input);
  const id = await db.transaction(async (tx) => {
    const { title, servings, sourceUrl } = recipe;
    const [{ id }] = await tx
      .insert(recipes)
      .values({ userId, title, servings, sourceUrl })
      .returning({ id: recipes.id });
    await writeChildren(tx, userId, id, recipe);
    return id;
  });
  return getRecipe(db, userId, id);
}

/** Replaces the recipe's fields, lines, steps and tags in one transaction. */
export async function updateRecipe(
  db: Database,
  userId: string,
  id: string,
  input: RecipeInput,
): Promise<Recipe> {
  if (!isUuid(id)) {
    throw new NotFoundError('recipe', id);
  }
  const recipe = await prepareRecipe(db, userId, input);
  await db.transaction(async (tx) => {
    const { title, servings, sourceUrl } = recipe;
    const [updated] = await tx
      .update(recipes)
      .set({ title, servings, sourceUrl, updatedAt: new Date() })
      .where(and(eq(recipes.userId, userId), eq(recipes.id, id)))
      .returning({ id: recipes.id });
    if (!updated) {
      throw new NotFoundError('recipe', id);
    }
    const children = (table: typeof recipeLines | typeof recipeSteps | typeof recipeTags) =>
      tx.delete(table).where(and(eq(table.userId, userId), eq(table.recipeId, id)));
    await children(recipeLines);
    await children(recipeSteps);
    await children(recipeTags);
    await writeChildren(tx, userId, id, recipe);
  });
  return getRecipe(db, userId, id);
}

export async function getRecipe(db: Database, userId: string, id: string): Promise<Recipe> {
  if (!isUuid(id)) {
    throw new NotFoundError('recipe', id);
  }
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.userId, userId), eq(recipes.id, id)));
  if (!recipe) {
    throw new NotFoundError('recipe', id);
  }

  const [lines, steps, tags] = await Promise.all([
    db
      .select({
        ingredientId: recipeLines.ingredientId,
        ingredientName: ingredients.name,
        amount: recipeLines.amount,
        unit: recipeLines.unit,
        canonicalAmount: recipeLines.canonicalAmount,
        canonicalUnit: ingredients.canonicalUnit,
        note: recipeLines.note,
      })
      .from(recipeLines)
      .innerJoin(
        ingredients,
        and(
          eq(ingredients.userId, recipeLines.userId),
          eq(ingredients.id, recipeLines.ingredientId),
        ),
      )
      .where(and(eq(recipeLines.userId, userId), eq(recipeLines.recipeId, id)))
      .orderBy(asc(recipeLines.position)),
    db
      .select({ text: recipeSteps.text })
      .from(recipeSteps)
      .where(and(eq(recipeSteps.userId, userId), eq(recipeSteps.recipeId, id)))
      .orderBy(asc(recipeSteps.position)),
    tagsByRecipe(db, userId, [id]),
  ]);

  return {
    id,
    title: recipe.title,
    servings: recipe.servings,
    sourceUrl: recipe.sourceUrl,
    archivedAt: recipe.archivedAt,
    lines,
    steps: steps.map((step) => step.text),
    tags: tags.get(id) ?? [],
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

async function tagsByRecipe(
  db: Database,
  userId: string,
  recipeIds: readonly string[],
): Promise<Map<string, string[]>> {
  const rows =
    recipeIds.length === 0
      ? []
      : await db
          .select()
          .from(recipeTags)
          .where(and(eq(recipeTags.userId, userId), inArray(recipeTags.recipeId, recipeIds)))
          .orderBy(asc(recipeTags.tag));
  const tags = new Map<string, string[]>();
  for (const row of rows) {
    tags.set(row.recipeId, [...(tags.get(row.recipeId) ?? []), row.tag]);
  }
  return tags;
}

/**
 * Lists the caller's recipes filtered by part of the title and by tag; archived
 * recipes are listed only, and exclusively, with `archived: true`.
 */
export async function searchRecipes(
  db: Database,
  userId: string,
  { query, tag, archived = false }: { query?: string; tag?: string; archived?: boolean } = {},
): Promise<RecipeSummary[]> {
  const term = query?.trim();
  const tagKey = tag?.trim().toLowerCase();
  const rows = await db
    .select({ id: recipes.id, title: recipes.title, servings: recipes.servings })
    .from(recipes)
    .where(
      and(
        eq(recipes.userId, userId),
        archived ? isNotNull(recipes.archivedAt) : isNull(recipes.archivedAt),
        term ? ilike(recipes.title, `%${escapeLike(term)}%`) : undefined,
        tagKey
          ? exists(
              db
                .select({ one: sql`1` })
                .from(recipeTags)
                .where(
                  and(
                    eq(recipeTags.userId, userId),
                    eq(recipeTags.recipeId, recipes.id),
                    eq(recipeTags.tag, tagKey),
                  ),
                ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(sql`lower(${recipes.title})`));
  const tags = await tagsByRecipe(
    db,
    userId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, tags: tags.get(row.id) ?? [] }));
}

async function setArchivedAt(
  db: Database,
  userId: string,
  id: string,
  archivedAt: SQL | null,
): Promise<void> {
  if (!isUuid(id)) {
    throw new NotFoundError('recipe', id);
  }
  const [updated] = await db
    .update(recipes)
    .set({ archivedAt })
    .where(and(eq(recipes.userId, userId), eq(recipes.id, id)))
    .returning({ id: recipes.id });
  if (!updated) {
    throw new NotFoundError('recipe', id);
  }
}

/**
 * Archives the recipe instead of removing it, so it can be restored and cook history
 * keeps resolving it.
 */
export function deleteRecipe(db: Database, userId: string, id: string): Promise<void> {
  return setArchivedAt(db, userId, id, sql`coalesce(${recipes.archivedAt}, now())`);
}

export function restoreRecipe(db: Database, userId: string, id: string): Promise<void> {
  return setArchivedAt(db, userId, id, null);
}
