import { recipeLines, recipes, users, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createIngredient,
  getIngredient,
  listIngredients,
  updateIngredient,
  type IngredientInput,
} from './catalog.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';

let testDb: TestDatabase;
let db: Database;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
  await db.insert(users).values([
    { id: 'user_a', email: 'a@example.com' },
    { id: 'user_b', email: 'b@example.com' },
  ]);
});

afterEach(async () => {
  await testDb.close();
});

const flour: IngredientInput = { name: 'Flour', canonicalUnit: 'g' };

describe('listIngredients', () => {
  it('finds an ingredient by alias and by a case-insensitive part of its name', async () => {
    await createIngredient(db, 'user_a', {
      name: 'Spring onion',
      aliases: ['Scallion'],
      canonicalUnit: 'piece',
    });
    await createIngredient(db, 'user_a', flour);

    const byAlias = await listIngredients(db, 'user_a', { query: 'scallion' });
    const byName = await listIngredients(db, 'user_a', { query: 'SPRING' });

    expect(byAlias.map((i) => i.name)).toEqual(['Spring onion']);
    expect(byName.map((i) => i.name)).toEqual(['Spring onion']);
    expect(byName[0].aliases).toEqual(['Scallion']);
  });

  it('treats LIKE wildcards in the query literally', async () => {
    await createIngredient(db, 'user_a', flour);

    expect(await listIngredients(db, 'user_a', { query: '%' })).toEqual([]);
  });

  it('lists all of the caller’s ingredients by name without a query', async () => {
    await createIngredient(db, 'user_a', { name: 'salt', canonicalUnit: 'g' });
    await createIngredient(db, 'user_a', flour);

    const all = await listIngredients(db, 'user_a');

    expect(all.map((i) => i.name)).toEqual(['Flour', 'salt']);
  });
});

describe('createIngredient', () => {
  it('stores aliases, pack sizes and conversions', async () => {
    const garlic = await createIngredient(db, 'user_a', {
      name: ' Garlic ',
      aliases: ['garlic clove'],
      canonicalUnit: 'cloves',
      packSizes: [10],
      conversions: [{ unit: 'Grams', factor: 0.2 }],
    });

    expect(await getIngredient(db, 'user_a', garlic.id)).toEqual({
      id: garlic.id,
      name: 'Garlic',
      aliases: ['garlic clove'],
      canonicalUnit: 'clove',
      packSizes: [10],
      conversions: [{ unit: 'g', factor: 0.2 }],
    });
  });

  it('accepts a unit outside the registry, trimmed and lowercased', async () => {
    const spinach = await createIngredient(db, 'user_a', {
      name: 'Spinach',
      canonicalUnit: 'g',
      conversions: [{ unit: ' Handful ', factor: 30 }],
    });

    expect(spinach.conversions).toEqual([{ unit: 'handful', factor: 30 }]);
  });

  it('refuses a second ingredient with the same name for one user, but not for another', async () => {
    await createIngredient(db, 'user_a', flour);

    await expect(createIngredient(db, 'user_a', { ...flour, name: 'FLOUR' })).rejects.toSatisfy(
      (error) => error instanceof ConflictError && error.reason === 'duplicate_name',
    );
    await expect(createIngredient(db, 'user_b', flour)).resolves.toMatchObject({ name: 'Flour' });
  });

  it('rejects a conversion with a non-positive factor', async () => {
    await expect(
      createIngredient(db, 'user_a', { ...flour, conversions: [{ unit: 'cup', factor: 0 }] }),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ValidationError && error.issues[0].field === 'conversions[0].factor',
    );
  });

  it('rejects a conversion for the canonical unit itself', async () => {
    await expect(
      createIngredient(db, 'user_a', { ...flour, conversions: [{ unit: 'grams', factor: 1 }] }),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ValidationError && error.issues[0].field === 'conversions[0].unit',
    );
  });

  it('rejects a non-positive pack size and a blank name', async () => {
    await expect(
      createIngredient(db, 'user_a', { name: ' ', canonicalUnit: 'g', packSizes: [-1] }),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ValidationError &&
        error.issues.map((issue) => issue.field).join() === 'name,packSizes[0]',
    );
  });
});

describe('updateIngredient', () => {
  it('replaces aliases, pack sizes and conversions', async () => {
    const cream = await createIngredient(db, 'user_a', {
      name: 'Cream',
      aliases: ['heavy cream'],
      canonicalUnit: 'ml',
      packSizes: [200],
    });

    const updated = await updateIngredient(db, 'user_a', cream.id, {
      name: 'Cream',
      canonicalUnit: 'ml',
      packSizes: [200, 500],
      conversions: [{ unit: 'cup', factor: 240 }],
    });

    expect(updated).toMatchObject({
      aliases: [],
      packSizes: [200, 500],
      conversions: [{ unit: 'cup', factor: 240 }],
    });
    expect(await getIngredient(db, 'user_a', cream.id)).toEqual(updated);
  });

  it('refuses to change the canonical unit of an ingredient a recipe line uses', async () => {
    const used = await createIngredient(db, 'user_a', flour);
    const unused = await createIngredient(db, 'user_a', { name: 'Sugar', canonicalUnit: 'g' });
    const [recipe] = await db
      .insert(recipes)
      .values({ userId: 'user_a', title: 'Bread', servings: 1 })
      .returning();
    await db.insert(recipeLines).values({
      userId: 'user_a',
      recipeId: recipe.id,
      position: 0,
      ingredientId: used.id,
      amount: 500,
      unit: 'g',
      canonicalAmount: 500,
    });

    await expect(
      updateIngredient(db, 'user_a', used.id, { ...flour, canonicalUnit: 'kg' }),
    ).rejects.toSatisfy(
      (error) => error instanceof ConflictError && error.reason === 'canonical_unit_in_use',
    );
    await expect(
      updateIngredient(db, 'user_a', used.id, {
        ...flour,
        canonicalUnit: 'grams',
        packSizes: [1000],
      }),
    ).resolves.toMatchObject({ canonicalUnit: 'g', packSizes: [1000] });
    await expect(
      updateIngredient(db, 'user_a', unused.id, { name: 'Sugar', canonicalUnit: 'kg' }),
    ).resolves.toMatchObject({ canonicalUnit: 'kg' });
  });

  it('recomputes stored recipe amounts when a conversion changes, and refuses removing a used one', async () => {
    const withCup = { ...flour, conversions: [{ unit: 'cup', factor: 12 }] };
    const ingredient = await createIngredient(db, 'user_a', withCup);
    const [recipe] = await db
      .insert(recipes)
      .values({ userId: 'user_a', title: 'Pancakes', servings: 2 })
      .returning();
    await db.insert(recipeLines).values({
      userId: 'user_a',
      recipeId: recipe.id,
      position: 0,
      ingredientId: ingredient.id,
      amount: 2,
      unit: 'cup',
      canonicalAmount: 24,
    });
    const storedAmount = async () =>
      (await db.select({ canonicalAmount: recipeLines.canonicalAmount }).from(recipeLines))[0]
        .canonicalAmount;

    await updateIngredient(db, 'user_a', ingredient.id, {
      ...flour,
      conversions: [{ unit: 'cup', factor: 120 }],
    });
    expect(await storedAmount()).toBe(240);

    await expect(updateIngredient(db, 'user_a', ingredient.id, flour)).rejects.toSatisfy(
      (error) => error instanceof ConflictError && error.reason === 'conversion_in_use',
    );
    expect(await storedAmount()).toBe(240);
    expect((await getIngredient(db, 'user_a', ingredient.id)).conversions).toEqual([
      { unit: 'cup', factor: 120 },
    ]);
  });

  it('refuses renaming onto another ingredient’s name', async () => {
    await createIngredient(db, 'user_a', flour);
    const sugar = await createIngredient(db, 'user_a', { name: 'Sugar', canonicalUnit: 'g' });

    await expect(updateIngredient(db, 'user_a', sugar.id, flour)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe('cross-user isolation', () => {
  it('never shows or changes another user’s ingredient', async () => {
    const theirs = await createIngredient(db, 'user_b', flour);

    expect(await listIngredients(db, 'user_a')).toEqual([]);
    expect(await listIngredients(db, 'user_a', { query: 'flour' })).toEqual([]);
    await expect(getIngredient(db, 'user_a', theirs.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateIngredient(db, 'user_a', theirs.id, { ...flour, name: 'Mine now' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await getIngredient(db, 'user_b', theirs.id)).name).toBe('Flour');
  });

  it('treats an ID that is not a UUID as not found', async () => {
    await expect(getIngredient(db, 'user_a', 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError);
  });
});
