import { users, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIngredient } from './catalog.js';
import { deleteCookEvent, getCookView, markCooked, rateCookEvent, scaleRecipe } from './cooking.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { setWeekEntries } from './planning.js';
import { createRecipe, deleteRecipe, type Recipe } from './recipes.js';

const now = new Date('2026-10-28T12:00:00Z');

let testDb: TestDatabase;
let db: Database;
let soup: Recipe;
let entryId: string;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
  await db.insert(users).values([
    { id: 'user_a', email: 'a@example.com' },
    { id: 'user_b', email: 'b@example.com' },
  ]);
  const onion = await createIngredient(db, 'user_a', { name: 'Onion', canonicalUnit: 'piece' });
  const stock = await createIngredient(db, 'user_a', { name: 'Stock', canonicalUnit: 'ml' });
  soup = await createRecipe(db, 'user_a', {
    title: 'Onion soup',
    servings: 2,
    lines: [
      { ingredientId: onion.id, amount: 1, unit: 'piece' },
      { ingredientId: stock.id, amount: 0.3, unit: 'l' },
    ],
    steps: ['Slice', 'Simmer'],
    tags: [],
  });
  const week = await setWeekEntries(
    db,
    'user_a',
    '2026-W44',
    [{ recipeId: soup.id, servings: 4 }],
    now,
  );
  entryId = week.entries[0].id;
});

afterEach(async () => {
  await testDb.close();
});

describe('scaleRecipe', () => {
  it('scales entered and canonical amounts to the servings', () => {
    const scaled = scaleRecipe(soup, 3);
    expect(scaled.servings).toBe(3);
    expect(scaled.lines.map((line) => [line.amount, line.canonicalAmount])).toEqual([
      [1.5, 1.5],
      [0.45, 450],
    ]);
  });

  it('refuses servings that are not a positive whole number', () => {
    expect(() => scaleRecipe(soup, 0)).toThrow(ValidationError);
    expect(() => scaleRecipe(soup, 1.5)).toThrow(ValidationError);
  });
});

describe('getCookView', () => {
  it('scales the recipe to the planned servings and keeps steps in order', async () => {
    const view = await getCookView(db, 'user_a', entryId);
    expect(view.entry).toEqual({ id: entryId, weekKey: '2026-W44', servings: 4, day: null });
    expect(view.recipe.lines.map((line) => [line.amount, line.unit])).toEqual([
      [2, 'piece'],
      [0.6, 'l'],
    ]);
    expect(view.recipe.steps).toEqual(['Slice', 'Simmer']);
    expect(view.cookEvents).toEqual([]);
  });

  it('still shows an entry whose recipe was archived later', async () => {
    await deleteRecipe(db, 'user_a', soup.id);
    const view = await getCookView(db, 'user_a', entryId);
    expect(view.recipe.archivedAt).not.toBeNull();
  });
});

describe('markCooked', () => {
  it('records a cook event with an optional rating, oldest first in the cook view', async () => {
    const rated = await markCooked(db, 'user_a', entryId, { rating: 4 }, now);
    const later = new Date('2026-10-29T12:00:00Z');
    const unrated = await markCooked(db, 'user_a', entryId, {}, later);
    expect(rated).toMatchObject({ cookedAt: now, rating: 4 });
    expect(unrated.rating).toBeNull();
    const view = await getCookView(db, 'user_a', entryId);
    expect(view.cookEvents.map((event) => event.id)).toEqual([rated.id, unrated.id]);
  });

  it('refuses a rating outside whole numbers 1 to 5', async () => {
    for (const rating of [0, 6, 2.5]) {
      await expect(markCooked(db, 'user_a', entryId, { rating }, now)).rejects.toThrow(
        ValidationError,
      );
    }
    expect((await getCookView(db, 'user_a', entryId)).cookEvents).toEqual([]);
  });
});

describe('rateCookEvent and deleteCookEvent', () => {
  it('sets and clears a rating later', async () => {
    const event = await markCooked(db, 'user_a', entryId, {}, now);
    expect((await rateCookEvent(db, 'user_a', event.id, 5)).rating).toBe(5);
    expect((await rateCookEvent(db, 'user_a', event.id, null)).rating).toBeNull();
    await expect(rateCookEvent(db, 'user_a', event.id, 7)).rejects.toThrow(ValidationError);
  });

  it('undoes a mark so the entry can be removed from its week again', async () => {
    const event = await markCooked(db, 'user_a', entryId, {}, now);
    await expect(setWeekEntries(db, 'user_a', '2026-W44', [], now)).rejects.toThrow(ConflictError);
    await deleteCookEvent(db, 'user_a', event.id);
    const week = await setWeekEntries(db, 'user_a', '2026-W44', [], now);
    expect(week.entries).toEqual([]);
  });
});

describe('cross-user isolation', () => {
  it('treats another user’s entry and cook events as not found', async () => {
    const event = await markCooked(db, 'user_a', entryId, { rating: 3 }, now);
    await expect(getCookView(db, 'user_b', entryId)).rejects.toThrow(NotFoundError);
    await expect(markCooked(db, 'user_b', entryId, {}, now)).rejects.toThrow(NotFoundError);
    await expect(rateCookEvent(db, 'user_b', event.id, 1)).rejects.toThrow(NotFoundError);
    await expect(deleteCookEvent(db, 'user_b', event.id)).rejects.toThrow(NotFoundError);
    const view = await getCookView(db, 'user_a', entryId);
    expect(view.cookEvents).toEqual([{ id: event.id, cookedAt: now, rating: 3 }]);
  });

  it('treats IDs that are not UUIDs as not found', async () => {
    await expect(getCookView(db, 'user_a', 'nope')).rejects.toThrow(NotFoundError);
    await expect(rateCookEvent(db, 'user_a', 'nope', 1)).rejects.toThrow(NotFoundError);
    await expect(deleteCookEvent(db, 'user_a', 'nope')).rejects.toThrow(NotFoundError);
  });
});
