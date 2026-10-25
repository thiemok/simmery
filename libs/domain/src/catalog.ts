import {
  ingredientAliases,
  ingredients,
  packSizes,
  recipeLines,
  unitConversions,
  type Database,
} from '@simmery/db';
import { unitKey, type UnitConversion } from '@simmery/units';
import { and, asc, eq, exists, ilike, inArray, or, sql } from 'drizzle-orm';
import {
  ConflictError,
  NotFoundError,
  isUniqueViolation,
  isUuid,
  throwIfIssues,
  type FieldIssue,
} from './errors.js';

export interface IngredientInput {
  name: string;
  aliases?: readonly string[];
  canonicalUnit: string;
  /** Amounts in the canonical unit. */
  packSizes?: readonly number[];
  conversions?: readonly UnitConversion[];
}

export interface Ingredient {
  id: string;
  name: string;
  aliases: string[];
  canonicalUnit: string;
  packSizes: number[];
  conversions: UnitConversion[];
}

/** An ingredient input after validation, with units in their stored form. */
export type PreparedIngredient = Omit<Ingredient, 'id'>;

const isPositive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * Validates an ingredient and brings units into the form `normalize` compares them in.
 * `field` prefixes issue paths when the ingredient is nested in a larger input.
 */
export function prepareIngredient(
  input: IngredientInput,
  field = '',
): { ingredient: PreparedIngredient; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const name = input.name.trim();
  if (!name) {
    issues.push({ field: `${field}name`, message: 'must not be empty' });
  }
  const canonicalUnit = unitKey(input.canonicalUnit);
  if (!canonicalUnit) {
    issues.push({ field: `${field}canonicalUnit`, message: 'must not be empty' });
  }

  const aliases = new Map<string, string>();
  for (const alias of input.aliases ?? []) {
    const trimmed = alias.trim();
    if (trimmed && trimmed.toLowerCase() !== name.toLowerCase()) {
      aliases.set(trimmed.toLowerCase(), trimmed);
    }
  }

  const packs = input.packSizes ?? [];
  packs.forEach((amount, index) => {
    if (!isPositive(amount)) {
      issues.push({ field: `${field}packSizes[${index}]`, message: 'must be a positive number' });
    }
  });

  const conversions: UnitConversion[] = [];
  (input.conversions ?? []).forEach((conversion, index) => {
    const unit = unitKey(conversion.unit);
    const path = `${field}conversions[${index}]`;
    if (!unit) {
      issues.push({ field: `${path}.unit`, message: 'must not be empty' });
    } else if (unit === canonicalUnit) {
      issues.push({ field: `${path}.unit`, message: 'is the canonical unit' });
    } else if (conversions.some((existing) => existing.unit === unit)) {
      issues.push({ field: `${path}.unit`, message: `duplicates the conversion for ${unit}` });
    }
    if (!isPositive(conversion.factor)) {
      issues.push({ field: `${path}.factor`, message: 'must be a positive number' });
    }
    conversions.push({ unit, factor: conversion.factor });
  });

  return {
    ingredient: {
      name,
      aliases: [...aliases.values()],
      canonicalUnit,
      packSizes: [...packs],
      conversions,
    },
    issues,
  };
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

/** Loads the caller's ingredients with these IDs; IDs of other users' ingredients are absent from the map. */
export async function loadIngredients(
  db: Database,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, Ingredient>> {
  const valid = [...new Set(ids)].filter(isUuid);
  if (valid.length === 0) {
    return new Map();
  }
  const rows = await db
    .select()
    .from(ingredients)
    .where(and(eq(ingredients.userId, userId), inArray(ingredients.id, valid)));
  const loaded = await withChildren(db, userId, rows);
  return new Map(loaded.map((ingredient) => [ingredient.id, ingredient]));
}

async function withChildren(
  db: Database,
  userId: string,
  rows: readonly { id: string; name: string; canonicalUnit: string }[],
): Promise<Ingredient[]> {
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);
  const [aliasRows, packRows, conversionRows] = await Promise.all([
    db
      .select()
      .from(ingredientAliases)
      .where(
        and(eq(ingredientAliases.userId, userId), inArray(ingredientAliases.ingredientId, ids)),
      )
      .orderBy(asc(sql`lower(${ingredientAliases.alias})`)),
    db
      .select()
      .from(packSizes)
      .where(and(eq(packSizes.userId, userId), inArray(packSizes.ingredientId, ids)))
      .orderBy(asc(packSizes.amount)),
    db
      .select()
      .from(unitConversions)
      .where(and(eq(unitConversions.userId, userId), inArray(unitConversions.ingredientId, ids)))
      .orderBy(asc(unitConversions.unit)),
  ]);

  return rows.map(({ id, name, canonicalUnit }) => ({
    id,
    name,
    canonicalUnit,
    aliases: aliasRows.filter((row) => row.ingredientId === id).map((row) => row.alias),
    packSizes: packRows.filter((row) => row.ingredientId === id).map((row) => row.amount),
    conversions: conversionRows
      .filter((row) => row.ingredientId === id)
      .map(({ unit, factor }) => ({ unit, factor })),
  }));
}

/** Lists the caller's ingredients, optionally filtered by a case-insensitive part of the name or an alias. */
export async function listIngredients(
  db: Database,
  userId: string,
  { query }: { query?: string } = {},
): Promise<Ingredient[]> {
  const term = query?.trim();
  const pattern = term ? `%${escapeLike(term)}%` : undefined;
  const rows = await db
    .select()
    .from(ingredients)
    .where(
      and(
        eq(ingredients.userId, userId),
        pattern
          ? or(
              ilike(ingredients.name, pattern),
              exists(
                db
                  .select({ one: sql`1` })
                  .from(ingredientAliases)
                  .where(
                    and(
                      eq(ingredientAliases.userId, userId),
                      eq(ingredientAliases.ingredientId, ingredients.id),
                      ilike(ingredientAliases.alias, pattern),
                    ),
                  ),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(sql`lower(${ingredients.name})`));
  return withChildren(db, userId, rows);
}

export async function getIngredient(db: Database, userId: string, id: string): Promise<Ingredient> {
  const ingredient = (await loadIngredients(db, userId, [id])).get(id);
  if (!ingredient) {
    throw new NotFoundError('ingredient', id);
  }
  return ingredient;
}

function duplicateName(name: string): ConflictError {
  return new ConflictError('duplicate_name', `an ingredient named "${name}" already exists`);
}

async function writeChildren(
  db: Database,
  userId: string,
  ingredientId: string,
  ingredient: PreparedIngredient,
): Promise<void> {
  if (ingredient.aliases.length > 0) {
    await db
      .insert(ingredientAliases)
      .values(ingredient.aliases.map((alias) => ({ userId, ingredientId, alias })));
  }
  if (ingredient.packSizes.length > 0) {
    await db
      .insert(packSizes)
      .values(ingredient.packSizes.map((amount) => ({ userId, ingredientId, amount })));
  }
  if (ingredient.conversions.length > 0) {
    await db
      .insert(unitConversions)
      .values(
        ingredient.conversions.map((conversion) => ({ userId, ingredientId, ...conversion })),
      );
  }
}

/** Inserts an already prepared ingredient; recipe saves call it inside their own transaction. */
export async function insertIngredient(
  db: Database,
  userId: string,
  ingredient: PreparedIngredient,
): Promise<string> {
  let id: string;
  try {
    [{ id }] = await db
      .insert(ingredients)
      .values({ userId, name: ingredient.name, canonicalUnit: ingredient.canonicalUnit })
      .returning({ id: ingredients.id });
  } catch (error) {
    if (isUniqueViolation(error, 'ingredients_user_id_name_key')) {
      throw duplicateName(ingredient.name);
    }
    throw error;
  }
  await writeChildren(db, userId, id, ingredient);
  return id;
}

export async function createIngredient(
  db: Database,
  userId: string,
  input: IngredientInput,
): Promise<Ingredient> {
  const { ingredient, issues } = prepareIngredient(input);
  throwIfIssues(issues);
  const id = await db.transaction((tx) => insertIngredient(tx, userId, ingredient));
  return getIngredient(db, userId, id);
}

/** Replaces the ingredient's name, unit, aliases, pack sizes and conversions. */
export async function updateIngredient(
  db: Database,
  userId: string,
  id: string,
  input: IngredientInput,
): Promise<Ingredient> {
  if (!isUuid(id)) {
    throw new NotFoundError('ingredient', id);
  }
  const { ingredient, issues } = prepareIngredient(input);
  throwIfIssues(issues);

  await db.transaction(async (tx) => {
    const owned = and(eq(ingredients.userId, userId), eq(ingredients.id, id));
    const [current] = await tx
      .select({ canonicalUnit: ingredients.canonicalUnit })
      .from(ingredients)
      .where(owned)
      .for('update');
    if (!current) {
      throw new NotFoundError('ingredient', id);
    }
    if (current.canonicalUnit !== ingredient.canonicalUnit) {
      // Stored canonical amounts on recipe lines would silently change meaning.
      const [used] = await tx
        .select({ id: recipeLines.id })
        .from(recipeLines)
        .where(and(eq(recipeLines.userId, userId), eq(recipeLines.ingredientId, id)))
        .limit(1);
      if (used) {
        throw new ConflictError(
          'canonical_unit_in_use',
          'the canonical unit cannot change while recipes use this ingredient',
        );
      }
    }

    try {
      await tx
        .update(ingredients)
        .set({
          name: ingredient.name,
          canonicalUnit: ingredient.canonicalUnit,
          updatedAt: new Date(),
        })
        .where(owned);
    } catch (error) {
      if (isUniqueViolation(error, 'ingredients_user_id_name_key')) {
        throw duplicateName(ingredient.name);
      }
      throw error;
    }
    const children = (
      table: typeof ingredientAliases | typeof packSizes | typeof unitConversions,
    ) => tx.delete(table).where(and(eq(table.userId, userId), eq(table.ingredientId, id)));
    await children(ingredientAliases);
    await children(packSizes);
    await children(unitConversions);
    await writeChildren(tx, userId, id, ingredient);
  });

  return getIngredient(db, userId, id);
}
