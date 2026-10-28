import { planEntries, users, weekPlans, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIngredient, listIngredients, updateIngredient, type Ingredient } from './catalog.js';
import { NotFoundError, UnresolvedUnitsError, ValidationError } from './errors.js';
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  restoreRecipe,
  searchRecipes,
  updateRecipe,
  type RecipeInput,
} from './recipes.js';

let testDb: TestDatabase;
let db: Database;
let flour: Ingredient;
let oil: Ingredient;
let garlic: Ingredient;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
  await db.insert(users).values([
    { id: 'user_a', email: 'a@example.com' },
    { id: 'user_b', email: 'b@example.com' },
  ]);
  flour = await createIngredient(db, 'user_a', { name: 'Flour', canonicalUnit: 'g' });
  oil = await createIngredient(db, 'user_a', { name: 'Olive oil', canonicalUnit: 'ml' });
  garlic = await createIngredient(db, 'user_a', { name: 'Garlic', canonicalUnit: 'clove' });
});

afterEach(async () => {
  await testDb.close();
});

function flatbread(overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title: 'Garlic flatbread',
    servings: 2,
    lines: [
      { ingredientId: flour.id, amount: 0.5, unit: 'kg' },
      { ingredientId: oil.id, amount: 2, unit: 'tbsp', note: 'extra virgin' },
      { ingredientId: garlic.id, amount: 3, unit: 'cloves' },
    ],
    steps: ['Mix the dough', 'Bake'],
    tags: ['Vegetarian', 'bread'],
    ...overrides,
  };
}

async function planRecipe(userId: string, recipeId: string) {
  const [week] = await db.insert(weekPlans).values({ userId, weekKey: '2026-W44' }).returning();
  await db.insert(planEntries).values({ userId, weekPlanId: week.id, recipeId, servings: 2 });
}

describe('createRecipe', () => {
  it('stores each line’s entered and canonical amount', async () => {
    const created = await createRecipe(db, 'user_a', flatbread());

    const recipe = await getRecipe(db, 'user_a', created.id);

    expect(recipe).toMatchObject({
      title: 'Garlic flatbread',
      servings: 2,
      sourceUrl: null,
      archivedAt: null,
      imported: false,
      steps: ['Mix the dough', 'Bake'],
      tags: ['bread', 'vegetarian'],
    });
    expect(recipe.lines).toEqual([
      {
        ingredientId: flour.id,
        ingredientName: 'Flour',
        amount: 0.5,
        unit: 'kg',
        canonicalAmount: 500,
        canonicalUnit: 'g',
        note: null,
      },
      {
        ingredientId: oil.id,
        ingredientName: 'Olive oil',
        amount: 2,
        unit: 'tbsp',
        canonicalAmount: 30,
        canonicalUnit: 'ml',
        note: 'extra virgin',
      },
      {
        ingredientId: garlic.id,
        ingredientName: 'Garlic',
        amount: 3,
        unit: 'clove',
        canonicalAmount: 3,
        canonicalUnit: 'clove',
        note: null,
      },
    ]);
  });

  it('Covers AE1. refuses a line whose unit cannot be normalized, names it and stores nothing', async () => {
    const input = flatbread({
      lines: [
        { newIngredient: { name: 'Salt', canonicalUnit: 'g' }, amount: 1, unit: 'pinch' },
        { ingredientId: flour.id, amount: 500, unit: 'g' },
        { ingredientId: garlic.id, amount: 50, unit: 'g' },
      ],
    });

    await expect(createRecipe(db, 'user_a', input)).rejects.toSatisfy(
      (error) =>
        error instanceof UnresolvedUnitsError &&
        JSON.stringify(error.lines) ===
          JSON.stringify([
            { index: 0, unit: 'pinch' },
            { index: 2, unit: 'g' },
          ]),
    );
    expect(await searchRecipes(db, 'user_a')).toEqual([]);
    expect((await listIngredients(db, 'user_a', { query: 'salt' })).length).toBe(0);

    await updateIngredient(db, 'user_a', garlic.id, {
      name: 'Garlic',
      canonicalUnit: 'clove',
      conversions: [{ unit: 'g', factor: 0.2 }],
    });
    const saved = await createRecipe(db, 'user_a', {
      ...input,
      lines: input.lines.slice(1),
    });
    expect(saved.lines[1]).toMatchObject({ amount: 50, unit: 'g', canonicalAmount: 10 });
  });

  it('creates a new ingredient in the caller’s catalog and links the line to it', async () => {
    const recipe = await createRecipe(
      db,
      'user_a',
      flatbread({
        lines: [
          {
            newIngredient: { name: 'Rosemary', canonicalUnit: 'sprig' },
            amount: 2,
            unit: 'sprigs',
          },
        ],
      }),
    );

    const [rosemary] = await listIngredients(db, 'user_a', { query: 'rosemary' });
    expect(recipe.lines).toEqual([
      expect.objectContaining({ ingredientId: rosemary.id, canonicalAmount: 2 }),
    ]);
  });

  it('reports field errors with their path', async () => {
    await expect(
      createRecipe(
        db,
        'user_a',
        flatbread({
          title: ' ',
          servings: 0,
          lines: [{ ingredientId: flour.id, amount: -1, unit: 'g' }],
          steps: [''],
        }),
      ),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ValidationError &&
        error.issues.map((issue) => issue.field).join() ===
          'title,servings,lines[0].amount,steps[0]',
    );
  });

  it('refuses a javascript: source URL and accepts an https one', async () => {
    await expect(
      createRecipe(db, 'user_a', flatbread({ sourceUrl: 'javascript:alert(1)' })),
    ).rejects.toSatisfy(
      (error) => error instanceof ValidationError && error.issues[0].field === 'sourceUrl',
    );
    await expect(
      createRecipe(db, 'user_a', flatbread({ sourceUrl: 'data:text/html,<p>hi</p>' })),
    ).rejects.toBeInstanceOf(ValidationError);

    const recipe = await createRecipe(
      db,
      'user_a',
      flatbread({ sourceUrl: 'https://example.com/flatbread' }),
    );
    expect(recipe.sourceUrl).toBe('https://example.com/flatbread');
  });
});

describe('updateRecipe', () => {
  it('replaces steps in the new order, and the lines and tags', async () => {
    const recipe = await createRecipe(db, 'user_a', flatbread());

    const updated = await updateRecipe(
      db,
      'user_a',
      recipe.id,
      flatbread({
        title: 'Flatbread',
        lines: [{ ingredientId: flour.id, amount: 300, unit: 'g' }],
        steps: ['Bake', 'Rest', 'Mix the dough'],
        tags: ['quick'],
      }),
    );

    expect(await getRecipe(db, 'user_a', recipe.id)).toEqual(updated);
    expect(updated).toMatchObject({
      title: 'Flatbread',
      steps: ['Bake', 'Rest', 'Mix the dough'],
      tags: ['quick'],
    });
    expect(updated.lines).toEqual([
      expect.objectContaining({ ingredientId: flour.id, amount: 300 }),
    ]);
  });

  it('keeps the stored recipe when the new version has an unresolved line', async () => {
    const recipe = await createRecipe(db, 'user_a', flatbread());

    await expect(
      updateRecipe(
        db,
        'user_a',
        recipe.id,
        flatbread({ lines: [{ ingredientId: flour.id, amount: 1, unit: 'piece' }] }),
      ),
    ).rejects.toBeInstanceOf(UnresolvedUnitsError);
    expect((await getRecipe(db, 'user_a', recipe.id)).lines).toHaveLength(3);
  });
});

describe('searchRecipes', () => {
  it('filters by tag and by a case-insensitive part of the title', async () => {
    await createRecipe(db, 'user_a', flatbread());
    await createRecipe(db, 'user_a', flatbread({ title: 'Beef ragù', tags: ['beef'] }));

    const vegetarian = await searchRecipes(db, 'user_a', { tag: 'vegetarian' });
    const byTitle = await searchRecipes(db, 'user_a', { query: 'RAG' });

    expect(vegetarian.map((recipe) => recipe.title)).toEqual(['Garlic flatbread']);
    expect(vegetarian[0].tags).toEqual(['bread', 'vegetarian']);
    expect(byTitle.map((recipe) => recipe.title)).toEqual(['Beef ragù']);
  });
});

describe('deleteRecipe', () => {
  it('archives the recipe: hidden from search, listed as archived and still readable', async () => {
    const recipe = await createRecipe(db, 'user_a', flatbread());

    await deleteRecipe(db, 'user_a', recipe.id);

    expect(await searchRecipes(db, 'user_a')).toEqual([]);
    expect((await searchRecipes(db, 'user_a', { archived: true })).map((r) => r.id)).toEqual([
      recipe.id,
    ]);
    expect((await getRecipe(db, 'user_a', recipe.id)).archivedAt).toBeInstanceOf(Date);
  });

  it('archives a planned recipe the same way', async () => {
    const recipe = await createRecipe(db, 'user_a', flatbread());
    await planRecipe('user_a', recipe.id);

    await deleteRecipe(db, 'user_a', recipe.id);

    expect((await getRecipe(db, 'user_a', recipe.id)).archivedAt).toBeInstanceOf(Date);
  });

  it('keeps the first archive time when deleted again', async () => {
    const recipe = await createRecipe(db, 'user_a', flatbread());
    await deleteRecipe(db, 'user_a', recipe.id);
    const { archivedAt } = await getRecipe(db, 'user_a', recipe.id);

    await deleteRecipe(db, 'user_a', recipe.id);

    expect((await getRecipe(db, 'user_a', recipe.id)).archivedAt).toEqual(archivedAt);
  });
});

describe('restoreRecipe', () => {
  it('brings an archived recipe back into search', async () => {
    const recipe = await createRecipe(db, 'user_a', flatbread());
    await deleteRecipe(db, 'user_a', recipe.id);

    await restoreRecipe(db, 'user_a', recipe.id);

    expect((await searchRecipes(db, 'user_a')).map((r) => r.id)).toEqual([recipe.id]);
    expect(await searchRecipes(db, 'user_a', { archived: true })).toEqual([]);
    expect((await getRecipe(db, 'user_a', recipe.id)).archivedAt).toBeNull();
  });
});

describe('cross-user isolation', () => {
  it('treats another user’s recipe as not found for read, edit, delete and restore', async () => {
    const recipe = await createRecipe(db, 'user_a', flatbread());

    await expect(getRecipe(db, 'user_b', recipe.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateRecipe(db, 'user_b', recipe.id, flatbread({ lines: [] })),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteRecipe(db, 'user_b', recipe.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restoreRecipe(db, 'user_b', recipe.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await searchRecipes(db, 'user_b')).toEqual([]);
    expect(await searchRecipes(db, 'user_b', { archived: true })).toEqual([]);
    expect((await getRecipe(db, 'user_a', recipe.id)).title).toBe('Garlic flatbread');
  });

  it('refuses a line that references another user’s ingredient', async () => {
    const theirs = await createIngredient(db, 'user_b', { name: 'Saffron', canonicalUnit: 'g' });

    await expect(
      createRecipe(
        db,
        'user_a',
        flatbread({ lines: [{ ingredientId: theirs.id, amount: 1, unit: 'g' }] }),
      ),
    ).rejects.toSatisfy((error) => error instanceof NotFoundError && error.id === theirs.id);
  });

  it('treats a recipe ID that is not a UUID as not found', async () => {
    await expect(getRecipe(db, 'user_a', '42')).rejects.toBeInstanceOf(NotFoundError);
  });
});
