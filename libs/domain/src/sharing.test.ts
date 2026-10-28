import { recipes, users, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIngredient, type Ingredient } from './catalog.js';
import {
  NoLongerSharedError,
  NotFoundError,
  UnresolvedUnitsError,
  ValidationError,
} from './errors.js';
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  restoreRecipe,
  updateRecipe,
  type Recipe,
} from './recipes.js';
import {
  createShareLink,
  importSharedRecipe,
  listShareLinks,
  resolveShareToken,
  revokeShareLink,
} from './sharing.js';

let testDb: TestDatabase;
let db: Database;
let garlic: Ingredient;
let bread: Recipe;
let bGarlic: Ingredient;
let bFlour: Ingredient;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
  await db.insert(users).values([
    { id: 'user_a', email: 'a@example.com' },
    { id: 'user_b', email: 'b@example.com' },
  ]);
  const flour = await createIngredient(db, 'user_a', { name: 'Flour', canonicalUnit: 'g' });
  garlic = await createIngredient(db, 'user_a', { name: 'Garlic', canonicalUnit: 'clove' });
  bread = await createRecipe(db, 'user_a', {
    title: 'Garlic bread',
    servings: 2,
    lines: [
      { ingredientId: flour.id, amount: 500, unit: 'g' },
      { ingredientId: garlic.id, amount: 3, unit: 'clove', note: 'crushed' },
    ],
    steps: ['Mix', 'Bake'],
    tags: ['bread'],
    sourceUrl: 'https://example.com/bread',
  });
  bFlour = await createIngredient(db, 'user_b', { name: 'Mehl', canonicalUnit: 'g' });
  bGarlic = await createIngredient(db, 'user_b', { name: 'Knoblauch', canonicalUnit: 'g' });
});

afterEach(async () => {
  await testDb.close();
});

describe('share links', () => {
  it('returns the active link on a second create and a new token after revoking', async () => {
    const link = await createShareLink(db, 'user_a', bread.id);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await createShareLink(db, 'user_a', bread.id)).toEqual(link);
    expect(await listShareLinks(db, 'user_a', bread.id)).toEqual([link]);

    await revokeShareLink(db, 'user_a', link.id);
    expect(await listShareLinks(db, 'user_a', bread.id)).toEqual([]);
    const next = await createShareLink(db, 'user_a', bread.id);
    expect(next.token).not.toBe(link.token);
  });

  it('refuses to share an archived recipe', async () => {
    await deleteRecipe(db, 'user_a', bread.id);
    await expect(createShareLink(db, 'user_a', bread.id)).rejects.toThrow(ValidationError);
  });
});

describe('resolveShareToken', () => {
  it('returns the recipe without user context and without owner or catalog IDs', async () => {
    const { token } = await createShareLink(db, 'user_a', bread.id);
    expect(await resolveShareToken(db, token)).toEqual({
      title: 'Garlic bread',
      servings: 2,
      sourceUrl: 'https://example.com/bread',
      lines: [
        { ingredientName: 'Flour', amount: 500, unit: 'g', note: null },
        { ingredientName: 'Garlic', amount: 3, unit: 'clove', note: 'crushed' },
      ],
      steps: ['Mix', 'Bake'],
      tags: ['bread'],
    });
  });

  it('treats an unknown or malformed token as not found', async () => {
    await expect(resolveShareToken(db, 'x'.repeat(43))).rejects.toThrow(NotFoundError);
    await expect(resolveShareToken(db, '')).rejects.toThrow(NotFoundError);
  });

  it('Covers AE5. reports a revoked link as no longer shared and leaves imported copies alone', async () => {
    const link = await createShareLink(db, 'user_a', bread.id);
    const copy = await importSharedRecipe(db, 'user_b', link.token, {
      lines: [{ ingredientId: bFlour.id }, { ingredientId: bGarlic.id, amount: 15, unit: 'g' }],
    });
    await revokeShareLink(db, 'user_a', link.id);
    await revokeShareLink(db, 'user_a', link.id);

    await expect(resolveShareToken(db, link.token)).rejects.toThrow(NoLongerSharedError);
    expect(await getRecipe(db, 'user_b', copy.id)).toEqual(copy);
  });

  it('stops sharing when the recipe is deleted, also after it is restored', async () => {
    const { token } = await createShareLink(db, 'user_a', bread.id);
    await deleteRecipe(db, 'user_a', bread.id);
    await expect(resolveShareToken(db, token)).rejects.toThrow(NoLongerSharedError);
    await restoreRecipe(db, 'user_a', bread.id);
    await expect(resolveShareToken(db, token)).rejects.toThrow(NoLongerSharedError);
  });
});

describe('importSharedRecipe', () => {
  it('creates an independent copy under the importer with existing and new ingredients', async () => {
    const { token } = await createShareLink(db, 'user_a', bread.id);
    const copy = await importSharedRecipe(db, 'user_b', token, {
      lines: [
        { ingredientId: bFlour.id },
        {
          newIngredient: {
            name: 'Garlic',
            canonicalUnit: 'clove',
          },
        },
      ],
    });

    expect(copy).toMatchObject({
      title: 'Garlic bread',
      servings: 2,
      imported: true,
      steps: ['Mix', 'Bake'],
      tags: ['bread'],
      sourceUrl: 'https://example.com/bread',
    });
    expect(
      copy.lines.map((line) => [line.ingredientName, line.amount, line.unit, line.note]),
    ).toEqual([
      ['Mehl', 500, 'g', null],
      ['Garlic', 3, 'clove', 'crushed'],
    ]);
    expect(copy.lines[1].ingredientId).not.toBe(garlic.id);
    expect(JSON.stringify(copy)).not.toContain('user_a');
    const [row] = await db.select().from(recipes).where(eq(recipes.id, copy.id));
    expect(row).toMatchObject({
      userId: 'user_b',
      importedFromUserId: 'user_a',
      importedFromRecipeId: bread.id,
    });

    await updateRecipe(db, 'user_a', bread.id, {
      title: 'Changed',
      servings: 4,
      lines: [],
      steps: ['Other'],
      tags: [],
    });
    expect(await getRecipe(db, 'user_b', copy.id)).toEqual(copy);
  });

  it('Covers R6. flags a line whose unit the mapped ingredient cannot take, and accepts an override', async () => {
    const { token } = await createShareLink(db, 'user_a', bread.id);
    const mapping = [{ ingredientId: bFlour.id }, { ingredientId: bGarlic.id }];
    const error = await importSharedRecipe(db, 'user_b', token, { lines: mapping }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(UnresolvedUnitsError);
    expect((error as UnresolvedUnitsError).lines).toEqual([{ index: 1, unit: 'clove' }]);

    const copy = await importSharedRecipe(db, 'user_b', token, {
      lines: [mapping[0], { ...mapping[1], amount: 15, unit: 'g' }],
    });
    expect(copy.lines[1]).toMatchObject({ amount: 15, unit: 'g', canonicalAmount: 15 });
  });

  it('refuses a mapping list of the wrong length', async () => {
    const { token } = await createShareLink(db, 'user_a', bread.id);
    await expect(
      importSharedRecipe(db, 'user_b', token, { lines: [{ ingredientId: bFlour.id }] }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a revoked link', async () => {
    const link = await createShareLink(db, 'user_a', bread.id);
    await revokeShareLink(db, 'user_a', link.id);
    await expect(
      importSharedRecipe(db, 'user_b', link.token, {
        lines: [{ ingredientId: bFlour.id }, { ingredientId: bGarlic.id }],
      }),
    ).rejects.toThrow(NoLongerSharedError);
  });
});

describe('cross-user isolation', () => {
  it('fails as not found when the mapping points at the sharer’s ingredient, and creates nothing', async () => {
    const { token } = await createShareLink(db, 'user_a', bread.id);
    await expect(
      importSharedRecipe(db, 'user_b', token, {
        lines: [{ ingredientId: bFlour.id }, { ingredientId: garlic.id }],
      }),
    ).rejects.toThrow(NotFoundError);
    expect(await db.select().from(recipes).where(eq(recipes.userId, 'user_b'))).toEqual([]);
  });

  it('treats another user’s recipe and link as not found and leaves the link active', async () => {
    const link = await createShareLink(db, 'user_a', bread.id);
    await expect(createShareLink(db, 'user_b', bread.id)).rejects.toThrow(NotFoundError);
    await expect(listShareLinks(db, 'user_b', bread.id)).rejects.toThrow(NotFoundError);
    await expect(revokeShareLink(db, 'user_b', link.id)).rejects.toThrow(NotFoundError);
    await expect(revokeShareLink(db, 'user_a', 'nope')).rejects.toThrow(NotFoundError);
    expect(await listShareLinks(db, 'user_a', bread.id)).toEqual([link]);
  });
});
