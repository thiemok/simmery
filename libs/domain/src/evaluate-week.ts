import { recipeLines, recipeTags, recipes, type Database } from '@simmery/db';
import { packFit, roundAmount } from '@simmery/units';
import { and, eq, inArray } from 'drizzle-orm';
import { loadIngredients } from './catalog.js';
import { NotFoundError, isUuid, throwIfIssues, type FieldIssue } from './errors.js';

export interface EvaluationEntry {
  recipeId: string;
  servings: number;
}

export interface EvaluationRecipe {
  id: string;
  servings: number;
  tags: readonly string[];
  /** Amounts in the ingredient's canonical unit, for the recipe's own servings. */
  lines: readonly { ingredientId: string; canonicalAmount: number }[];
}

export interface EvaluationIngredient {
  id: string;
  name: string;
  canonicalUnit: string;
  packSizes: readonly number[];
}

export interface WeekIngredientLine {
  ingredientId: string;
  name: string;
  unit: string;
  total: number;
  /** How many planned entries use the ingredient. */
  entryCount: number;
  /** Least-waste leftover (KTD7); null when the ingredient has no pack sizes. */
  leftover: number | null;
}

export interface WeekEvaluation {
  lines: WeekIngredientLine[];
  /** Lines used by two or more entries. */
  overlap: WeekIngredientLine[];
  /** Planned entries per recipe tag. */
  tagCounts: Record<string, number>;
}

/** Pure evaluation of a week's entries: per-ingredient totals, overlap, leftovers and tag counts. */
export function evaluateWeek(
  entries: readonly EvaluationEntry[],
  recipesById: ReadonlyMap<string, EvaluationRecipe>,
  ingredientsById: ReadonlyMap<string, EvaluationIngredient>,
): WeekEvaluation {
  const totals = new Map<string, { amount: number; entryCount: number }>();
  const tagCounts: Record<string, number> = {};

  for (const entry of entries) {
    const recipe = recipesById.get(entry.recipeId);
    if (!recipe) {
      throw new Error(`recipe ${entry.recipeId} was not loaded for evaluation`);
    }
    const scale = entry.servings / recipe.servings;
    const used = new Set<string>();
    for (const line of recipe.lines) {
      const total = totals.get(line.ingredientId) ?? { amount: 0, entryCount: 0 };
      total.amount += line.canonicalAmount * scale;
      if (!used.has(line.ingredientId)) {
        used.add(line.ingredientId);
        total.entryCount += 1;
      }
      totals.set(line.ingredientId, total);
    }
    for (const tag of recipe.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  const lines = [...totals].map(([ingredientId, { amount, entryCount }]): WeekIngredientLine => {
    const ingredient = ingredientsById.get(ingredientId);
    if (!ingredient) {
      throw new Error(`ingredient ${ingredientId} was not loaded for evaluation`);
    }
    const total = roundAmount(amount);
    return {
      ingredientId,
      name: ingredient.name,
      unit: ingredient.canonicalUnit,
      total,
      entryCount,
      leftover: packFit(total, ingredient.packSizes)?.leftover ?? null,
    };
  });
  lines.sort(
    (a, b) => a.name.localeCompare(b.name) || a.ingredientId.localeCompare(b.ingredientId),
  );

  const sortedTags = Object.fromEntries(
    Object.entries(tagCounts).sort(([a], [b]) => a.localeCompare(b)),
  );
  return { lines, overlap: lines.filter((line) => line.entryCount >= 2), tagCounts: sortedTags };
}

interface LoadedRecipe extends EvaluationRecipe {
  archived: boolean;
}

async function loadRecipes(
  db: Database,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, LoadedRecipe>> {
  const unique = [...new Set(ids)];
  const invalid = unique.find((id) => !isUuid(id));
  if (invalid) {
    throw new NotFoundError('recipe', invalid);
  }
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: recipes.id, servings: recipes.servings, archivedAt: recipes.archivedAt })
    .from(recipes)
    .where(and(eq(recipes.userId, userId), inArray(recipes.id, unique)));
  const missing = unique.find((id) => !rows.some((row) => row.id === id));
  if (missing) {
    throw new NotFoundError('recipe', missing);
  }

  const [lineRows, tagRows] = await Promise.all([
    db
      .select({
        recipeId: recipeLines.recipeId,
        ingredientId: recipeLines.ingredientId,
        canonicalAmount: recipeLines.canonicalAmount,
      })
      .from(recipeLines)
      .where(and(eq(recipeLines.userId, userId), inArray(recipeLines.recipeId, unique))),
    db
      .select({ recipeId: recipeTags.recipeId, tag: recipeTags.tag })
      .from(recipeTags)
      .where(and(eq(recipeTags.userId, userId), inArray(recipeTags.recipeId, unique))),
  ]);

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        servings: row.servings,
        archived: row.archivedAt !== null,
        tags: tagRows.filter((tag) => tag.recipeId === row.id).map((tag) => tag.tag),
        lines: lineRows.filter((line) => line.recipeId === row.id),
      },
    ]),
  );
}

/**
 * Evaluates entries against the caller's recipes and catalog. A recipe ID that is not
 * the caller's is not found before any ingredient is read (KTD4).
 */
export async function evaluateEntries(
  db: Database,
  userId: string,
  entries: readonly EvaluationEntry[],
  { rejectArchived = false }: { rejectArchived?: boolean } = {},
): Promise<WeekEvaluation> {
  const loaded = await loadRecipes(
    db,
    userId,
    entries.map((entry) => entry.recipeId),
  );
  if (rejectArchived) {
    throwIfIssues(archivedIssues(entries, loaded));
  }
  const ingredientIds = [...loaded.values()].flatMap((recipe) =>
    recipe.lines.map((line) => line.ingredientId),
  );
  const ingredients = await loadIngredients(db, userId, ingredientIds);
  return evaluateWeek(entries, loaded, ingredients);
}

function archivedIssues(
  entries: readonly EvaluationEntry[],
  loaded: ReadonlyMap<string, LoadedRecipe>,
): FieldIssue[] {
  return entries.flatMap((entry, index) =>
    loaded.get(entry.recipeId)?.archived
      ? [{ field: `entries[${index}].recipeId`, message: 'recipe is archived' }]
      : [],
  );
}

export function servingsIssues(entries: readonly EvaluationEntry[]): FieldIssue[] {
  return entries.flatMap((entry, index) =>
    Number.isInteger(entry.servings) && entry.servings >= 1
      ? []
      : [{ field: `entries[${index}].servings`, message: 'must be a positive whole number' }],
  );
}

/** Evaluates an unsaved candidate week; nothing is stored. Archived recipes are refused. */
export async function evaluateCandidateWeek(
  db: Database,
  userId: string,
  entries: readonly EvaluationEntry[],
): Promise<WeekEvaluation> {
  throwIfIssues(servingsIssues(entries));
  return evaluateEntries(db, userId, entries, { rejectArchived: true });
}
