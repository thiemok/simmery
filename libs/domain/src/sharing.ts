import { randomBytes } from 'node:crypto';
import { recipes, shareLinks, type Database } from '@simmery/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { IngredientInput } from './catalog.js';
import { NoLongerSharedError, NotFoundError, isUuid, throwIfIssues } from './errors.js';
import { getRecipe, insertRecipe, type Recipe, type RecipeLineInput } from './recipes.js';

export interface ShareLink {
  id: string;
  token: string;
  createdAt: Date;
}

/** A shared recipe as anyone with the link sees it: no IDs of the owner or their catalog. */
export interface SharedRecipe {
  title: string;
  servings: number;
  sourceUrl: string | null;
  lines: { ingredientName: string; amount: number; unit: string; note: string | null }[];
  steps: string[];
  tags: string[];
}

/**
 * Maps one source line to the importer's catalog; `amount` and `unit` override the
 * source line's, so an unresolved unit can be converted during import (R6).
 */
export type ImportLineMapping = (
  | { ingredientId: string; newIngredient?: never }
  | { newIngredient: IngredientInput; ingredientId?: never }
) & {
  amount?: number;
  unit?: string;
};

const linkColumns = { id: shareLinks.id, token: shareLinks.token, createdAt: shareLinks.createdAt };

async function loadOwnedRecipe(db: Database, userId: string, recipeId: string) {
  if (!isUuid(recipeId)) {
    throw new NotFoundError('recipe', recipeId);
  }
  const [recipe] = await db
    .select({ id: recipes.id, archivedAt: recipes.archivedAt })
    .from(recipes)
    .where(and(eq(recipes.userId, userId), eq(recipes.id, recipeId)));
  if (!recipe) {
    throw new NotFoundError('recipe', recipeId);
  }
  return recipe;
}

function activeLinks(db: Database, userId: string, recipeId: string) {
  return db
    .select(linkColumns)
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.userId, userId),
        eq(shareLinks.recipeId, recipeId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .orderBy(asc(shareLinks.createdAt), asc(shareLinks.id));
}

/** Returns the recipe's active link, or creates one with an unguessable token (R23). */
export async function createShareLink(
  db: Database,
  userId: string,
  recipeId: string,
): Promise<ShareLink> {
  const recipe = await loadOwnedRecipe(db, userId, recipeId);
  if (recipe.archivedAt) {
    throwIfIssues([{ field: 'recipeId', message: 'recipe is archived' }]);
  }
  const [existing] = await activeLinks(db, userId, recipeId).limit(1);
  if (existing) {
    return existing;
  }
  const [created] = await db
    .insert(shareLinks)
    .values({ userId, recipeId, token: randomBytes(32).toString('base64url') })
    .returning(linkColumns);
  return created;
}

export async function listShareLinks(
  db: Database,
  userId: string,
  recipeId: string,
): Promise<ShareLink[]> {
  await loadOwnedRecipe(db, userId, recipeId);
  return activeLinks(db, userId, recipeId);
}

/** Revokes the link; revoking it again keeps the first revocation time. */
export async function revokeShareLink(db: Database, userId: string, linkId: string): Promise<void> {
  if (!isUuid(linkId)) {
    throw new NotFoundError('share_link', linkId);
  }
  const [revoked] = await db
    .update(shareLinks)
    .set({ revokedAt: sql`coalesce(${shareLinks.revokedAt}, now())` })
    .where(and(eq(shareLinks.userId, userId), eq(shareLinks.id, linkId)))
    .returning({ id: shareLinks.id });
  if (!revoked) {
    throw new NotFoundError('share_link', linkId);
  }
}

async function loadShared(
  db: Database,
  token: string,
): Promise<{ ownerId: string; recipe: Recipe }> {
  const [link] = await db
    .select({
      userId: shareLinks.userId,
      recipeId: shareLinks.recipeId,
      revokedAt: shareLinks.revokedAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.token, token));
  if (!link) {
    // The token itself is a secret, so it stays out of the error message.
    throw new NotFoundError('share_link', 'token');
  }
  if (link.revokedAt) {
    throw new NoLongerSharedError();
  }
  return { ownerId: link.userId, recipe: await getRecipe(db, link.userId, link.recipeId) };
}

/** Reads a shared recipe without any user context; anyone holding the token may call it. */
export async function resolveShareToken(db: Database, token: string): Promise<SharedRecipe> {
  const { recipe } = await loadShared(db, token);
  return {
    title: recipe.title,
    servings: recipe.servings,
    sourceUrl: recipe.sourceUrl,
    lines: recipe.lines.map(({ ingredientName, amount, unit, note }) => ({
      ingredientName,
      amount,
      unit,
      note,
    })),
    steps: recipe.steps,
    tags: recipe.tags,
  };
}

/**
 * Copies a shared recipe into the caller's collection, with each source line mapped to
 * the caller's catalog and normalized like any other save (R24).
 */
export async function importSharedRecipe(
  db: Database,
  userId: string,
  token: string,
  { lines }: { lines: readonly ImportLineMapping[] },
): Promise<Recipe> {
  const { ownerId, recipe } = await loadShared(db, token);
  if (lines.length !== recipe.lines.length) {
    throwIfIssues([
      { field: 'lines', message: `must map each of the ${recipe.lines.length} source lines` },
    ]);
  }
  return insertRecipe(
    db,
    userId,
    {
      title: recipe.title,
      servings: recipe.servings,
      sourceUrl: recipe.sourceUrl,
      steps: recipe.steps,
      tags: recipe.tags,
      lines: lines.map(
        ({ amount, unit, ...ingredient }, index) =>
          ({
            ...ingredient,
            amount: amount ?? recipe.lines[index].amount,
            unit: unit ?? recipe.lines[index].unit,
            note: recipe.lines[index].note,
          }) as RecipeLineInput,
      ),
    },
    { userId: ownerId, recipeId: recipe.id },
  );
}
