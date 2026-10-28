import { users, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIngredient, updateIngredient, type Ingredient } from './catalog.js';
import { markCooked } from './cooking.js';
import { setWeekEntries } from './planning.js';
import { createRecipe, deleteRecipe, updateRecipe, type Recipe } from './recipes.js';
import { getStatistics } from './stats.js';

// Wednesday of 2026-W44.
const now = new Date('2026-10-28T12:00:00Z');
const weeksAgo = (weeks: number) => new Date(now.getTime() - weeks * 7 * 86_400_000);

let testDb: TestDatabase;
let db: Database;
let cream: Ingredient;
let onion: Ingredient;
let soup: Recipe;
let stew: Recipe;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
  await db.insert(users).values([
    { id: 'user_a', email: 'a@example.com' },
    { id: 'user_b', email: 'b@example.com' },
  ]);
  onion = await createIngredient(db, 'user_a', { name: 'Onion', canonicalUnit: 'piece' });
  cream = await createIngredient(db, 'user_a', {
    name: 'Cream',
    canonicalUnit: 'ml',
    packSizes: [200, 500],
  });
  soup = await createRecipe(db, 'user_a', {
    title: 'Onion soup',
    servings: 2,
    lines: [
      { ingredientId: onion.id, amount: 1, unit: 'piece' },
      { ingredientId: cream.id, amount: 150, unit: 'ml' },
    ],
    steps: ['Cook'],
    tags: ['soup'],
  });
  stew = await createRecipe(db, 'user_a', {
    title: 'Stew',
    servings: 2,
    lines: [{ ingredientId: onion.id, amount: 2, unit: 'piece' }],
    steps: ['Simmer'],
    tags: ['meat'],
  });
  await createRecipe(db, 'user_a', {
    title: 'Salad',
    servings: 2,
    lines: [],
    steps: ['Toss'],
    tags: [],
  });
});

afterEach(async () => {
  await testDb.close();
});

async function plan(weekKey: string, recipes: Recipe[]): Promise<string[]> {
  const week = await setWeekEntries(
    db,
    'user_a',
    weekKey,
    recipes.map((recipe) => ({ recipeId: recipe.id, servings: 2 })),
    now,
  );
  return recipes.map((recipe) => week.entries.find((entry) => entry.recipeId === recipe.id)!.id);
}

describe('getStatistics', () => {
  it('returns empty collections for a user with no data', async () => {
    expect(await getStatistics(db, 'user_b', now)).toEqual({
      recipes: [],
      notCookedRecently: [],
      cooks: [],
      weeks: [],
      mostBought: [],
    });
  });

  it('Covers R19. shows a rated cook in cook history, ratings and the recipe’s figures', async () => {
    const [entryId] = await plan('2026-W44', [soup]);
    const event = await markCooked(db, 'user_a', entryId, { rating: 4 }, now);
    const stats = await getStatistics(db, 'user_a', now);
    expect(stats.cooks).toEqual([
      {
        cookEventId: event.id,
        planEntryId: entryId,
        recipeId: soup.id,
        recipeTitle: 'Onion soup',
        cookedAt: now,
        rating: 4,
      },
    ]);
    expect(stats.recipes[0]).toEqual({
      recipeId: soup.id,
      title: 'Onion soup',
      archived: false,
      cookCount: 1,
      lastCookedAt: now,
      averageRating: 4,
    });
  });

  it('averages ratings over rated cooks only', async () => {
    const [entryId] = await plan('2026-W44', [soup]);
    await markCooked(db, 'user_a', entryId, { rating: 4 }, weeksAgo(0.2));
    await markCooked(db, 'user_a', entryId, { rating: 5 }, weeksAgo(0.1));
    await markCooked(db, 'user_a', entryId, {}, now);
    const [soupStats] = (await getStatistics(db, 'user_a', now)).recipes;
    expect(soupStats).toMatchObject({ cookCount: 3, averageRating: 4.5 });
  });

  it('lists recipes not cooked recently, never-cooked first, and leaves out archived ones', async () => {
    const [soupEntry] = await plan('2026-W38', [soup]);
    const [stewEntry] = await plan('2026-W43', [stew]);
    await markCooked(db, 'user_a', soupEntry, {}, weeksAgo(6));
    await markCooked(db, 'user_a', stewEntry, {}, weeksAgo(1));
    const archived = await createRecipe(db, 'user_a', {
      title: 'Old pie',
      servings: 2,
      lines: [],
      steps: ['Bake'],
      tags: [],
    });
    await deleteRecipe(db, 'user_a', archived.id);

    const stats = await getStatistics(db, 'user_a', now);
    expect(stats.notCookedRecently.map((row) => row.title)).toEqual(['Salad', 'Onion soup']);
    expect(stats.recipes.map((row) => row.title)).toEqual(['Stew', 'Onion soup', 'Salad']);
  });

  it('keeps an archived recipe that was cooked in the cook history', async () => {
    const [entryId] = await plan('2026-W44', [stew]);
    await markCooked(db, 'user_a', entryId, {}, now);
    await deleteRecipe(db, 'user_a', stew.id);
    const stats = await getStatistics(db, 'user_a', now);
    expect(stats.recipes.find((row) => row.recipeId === stew.id)?.archived).toBe(true);
  });

  it('keeps a snapshotted week’s figures when the recipe and pack sizes change later', async () => {
    await plan('2026-W43', [soup, stew]);
    const before = await getStatistics(db, 'user_a', now);
    const [frozen] = before.weeks;
    expect(frozen.weekKey).toBe('2026-W43');
    expect(frozen.frozen).toBe(true);
    expect(frozen.evaluation.lines.find((line) => line.name === 'Cream')).toMatchObject({
      total: 150,
      leftover: 50,
    });

    await updateIngredient(db, 'user_a', cream.id, {
      name: 'Cream',
      canonicalUnit: 'ml',
      packSizes: [1000],
    });
    await updateRecipe(db, 'user_a', soup.id, {
      title: 'Onion soup',
      servings: 2,
      lines: [{ ingredientId: cream.id, amount: 400, unit: 'ml' }],
      steps: ['Cook'],
      tags: ['soup'],
    });

    const after = await getStatistics(db, 'user_a', now);
    expect(after.weeks).toEqual(before.weeks);
    expect(after.mostBought).toEqual(before.mostBought);
  });

  it('shows live figures for the current week before its first check-off', async () => {
    await plan('2026-W44', [soup]);
    await updateRecipe(db, 'user_a', soup.id, {
      title: 'Onion soup',
      servings: 2,
      lines: [{ ingredientId: cream.id, amount: 450, unit: 'ml' }],
      steps: ['Cook'],
      tags: ['soup'],
    });
    const [current] = (await getStatistics(db, 'user_a', now)).weeks;
    expect(current).toMatchObject({ weekKey: '2026-W44', frozen: false });
    expect(current.evaluation.lines).toEqual([
      expect.objectContaining({ name: 'Cream', total: 450, leftover: 50 }),
    ]);
  });

  it('leaves out future weeks and weeks before the trend span', async () => {
    await plan('2026-W45', [soup]);
    await plan('2026-W32', [soup]);
    await plan('2026-W33', [stew]);
    const stats = await getStatistics(db, 'user_a', now);
    expect(stats.weeks.map((week) => week.weekKey)).toEqual(['2026-W33']);
  });

  it('ranks an ingredient bought in more weeks above a single larger week', async () => {
    const cheese = await createIngredient(db, 'user_a', { name: 'Cheese', canonicalUnit: 'g' });
    const gratin = await createRecipe(db, 'user_a', {
      title: 'Gratin',
      servings: 2,
      lines: [{ ingredientId: cheese.id, amount: 900, unit: 'g' }],
      steps: ['Bake'],
      tags: [],
    });
    await plan('2026-W41', [stew]);
    await plan('2026-W42', [stew]);
    await plan('2026-W43', [stew, gratin]);
    const { mostBought } = await getStatistics(db, 'user_a', now);
    expect(mostBought.map(({ name, weeks, total }) => [name, weeks, total])).toEqual([
      ['Onion', 3, 6],
      ['Cheese', 1, 900],
    ]);
  });

  it('returns none of another user’s cooks, recipes or weeks', async () => {
    const [entryId] = await plan('2026-W43', [soup]);
    await markCooked(db, 'user_a', entryId, { rating: 2 }, weeksAgo(1));
    const stats = await getStatistics(db, 'user_b', now);
    expect(stats).toEqual({
      recipes: [],
      notCookedRecently: [],
      cooks: [],
      weeks: [],
      mostBought: [],
    });
  });
});
