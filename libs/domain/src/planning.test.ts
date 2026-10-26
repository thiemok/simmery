import { cookEvents, planEntries, users, weekSnapshots, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIngredient } from './catalog.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { evaluateCandidateWeek } from './evaluate-week.js';
import { getWeek, setWeekEntries, snapshotEndedWeeks } from './planning.js';
import { createRecipe, deleteRecipe, type Recipe } from './recipes.js';

const now = new Date('2026-10-28T12:00:00Z');

let testDb: TestDatabase;
let db: Database;
let soup: Recipe;
let stew: Recipe;
let otherUsersRecipe: Recipe;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
  await db.insert(users).values([
    { id: 'user_a', email: 'a@example.com' },
    { id: 'user_b', email: 'b@example.com' },
  ]);
  const onion = await createIngredient(db, 'user_a', { name: 'Onion', canonicalUnit: 'piece' });
  const cream = await createIngredient(db, 'user_a', {
    name: 'Cream',
    canonicalUnit: 'ml',
    packSizes: [200, 500],
  });
  soup = await createRecipe(db, 'user_a', {
    title: 'Onion soup',
    servings: 2,
    lines: [
      { ingredientId: onion.id, amount: 1, unit: 'piece' },
      { ingredientId: cream.id, amount: 100, unit: 'ml' },
    ],
    steps: ['Cook'],
    tags: ['soup'],
  });
  stew = await createRecipe(db, 'user_a', {
    title: 'Stew',
    servings: 2,
    lines: [{ ingredientId: onion.id, amount: 2, unit: 'piece' }],
    steps: ['Simmer'],
    tags: [],
  });
  const secret = await createIngredient(db, 'user_b', { name: 'Truffle', canonicalUnit: 'g' });
  otherUsersRecipe = await createRecipe(db, 'user_b', {
    title: 'Truffle pasta',
    servings: 2,
    lines: [{ ingredientId: secret.id, amount: 10, unit: 'g' }],
    steps: ['Shave'],
    tags: [],
  });
});

afterEach(async () => {
  await testDb.close();
});

const fieldsOf = (error: unknown) =>
  error instanceof ValidationError ? error.issues.map((issue) => issue.field).join() : '';

describe('getWeek', () => {
  it('creates the week on first read and returns the same week afterwards', async () => {
    const first = await getWeek(db, 'user_a', '2026-W44', now);
    const second = await getWeek(db, 'user_a', '2026-W44', now);

    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({
      weekKey: '2026-W44',
      entries: [],
      evaluation: { lines: [], overlap: [], tagCounts: {} },
    });
  });

  it('accepts week 53 only in years that have it', async () => {
    await expect(getWeek(db, 'user_a', '2026-W53', now)).resolves.toMatchObject({
      weekKey: '2026-W53',
    });
    for (const key of ['2025-W53', '2026-W54', '2026-W00', '2026-44', '2026-w44']) {
      await expect(getWeek(db, 'user_a', key, now)).rejects.toSatisfy(
        (error) => fieldsOf(error) === 'weekKey',
      );
    }
  });

  it('keeps each user’s week separate', async () => {
    await setWeekEntries(db, 'user_a', '2026-W44', [{ recipeId: soup.id, servings: 2 }], now);

    const week = await getWeek(db, 'user_b', '2026-W44', now);

    expect(week.entries).toEqual([]);
  });
});

describe('setWeekEntries', () => {
  it('stores entries with servings and optional day, and evaluates them', async () => {
    const week = await setWeekEntries(
      db,
      'user_a',
      '2026-W44',
      [
        { recipeId: soup.id, servings: 4, day: 1 },
        { recipeId: stew.id, servings: 2 },
      ],
      now,
    );

    expect(week.entries).toEqual([
      { id: expect.any(String), recipeId: soup.id, recipeTitle: 'Onion soup', servings: 4, day: 1 },
      { id: expect.any(String), recipeId: stew.id, recipeTitle: 'Stew', servings: 2, day: null },
    ]);
    expect(week.evaluation.lines).toEqual([
      expect.objectContaining({ name: 'Cream', total: 200, leftover: 0 }),
      expect.objectContaining({ name: 'Onion', total: 4, entryCount: 2 }),
    ]);
    expect(week.evaluation.tagCounts).toEqual({ soup: 1 });
  });

  it('updates given entries in place, inserts new ones and deletes omitted ones', async () => {
    const first = await setWeekEntries(
      db,
      'user_a',
      '2026-W44',
      [
        { recipeId: soup.id, servings: 2 },
        { recipeId: stew.id, servings: 2 },
      ],
      now,
    );
    const kept = first.entries.find((entry) => entry.recipeId === soup.id)!;

    const second = await setWeekEntries(
      db,
      'user_a',
      '2026-W44',
      [
        { id: kept.id, recipeId: soup.id, servings: 3, day: 5 },
        { recipeId: stew.id, servings: 4 },
      ],
      now,
    );

    const removed = first.entries.find((entry) => entry.recipeId === stew.id)!;
    expect(second.entries).toEqual([
      { id: kept.id, recipeId: soup.id, recipeTitle: 'Onion soup', servings: 3, day: 5 },
      expect.objectContaining({ recipeId: stew.id, servings: 4, day: null }),
    ]);
    expect(second.entries.map((entry) => entry.id)).not.toContain(removed.id);
  });

  it('refuses to remove a cooked entry and changes nothing', async () => {
    const week = await setWeekEntries(
      db,
      'user_a',
      '2026-W44',
      [
        { recipeId: soup.id, servings: 2 },
        { recipeId: stew.id, servings: 2 },
      ],
      now,
    );
    const cooked = week.entries[0];
    await db.insert(cookEvents).values({ userId: 'user_a', planEntryId: cooked.id });

    await expect(
      setWeekEntries(
        db,
        'user_a',
        '2026-W44',
        [{ id: week.entries[1].id, recipeId: stew.id, servings: 6 }],
        now,
      ),
    ).rejects.toSatisfy(
      (error) => error instanceof ConflictError && error.reason === 'entry_cooked',
    );
    expect((await getWeek(db, 'user_a', '2026-W44', now)).entries).toEqual(week.entries);
  });

  it('refuses to change the recipe of a saved entry', async () => {
    const week = await setWeekEntries(
      db,
      'user_a',
      '2026-W44',
      [{ recipeId: soup.id, servings: 2 }],
      now,
    );

    await expect(
      setWeekEntries(
        db,
        'user_a',
        '2026-W44',
        [{ id: week.entries[0].id, recipeId: stew.id, servings: 2 }],
        now,
      ),
    ).rejects.toSatisfy((error) => fieldsOf(error) === 'entries[0].recipeId');
  });

  it('rejects invalid servings and days', async () => {
    await expect(
      setWeekEntries(
        db,
        'user_a',
        '2026-W44',
        [
          { recipeId: soup.id, servings: 0 },
          { recipeId: stew.id, servings: 1.5, day: 8 },
          { recipeId: stew.id, servings: 2, day: 0 },
        ],
        now,
      ),
    ).rejects.toSatisfy(
      (error) =>
        fieldsOf(error) === 'entries[0].servings,entries[1].servings,entries[1].day,entries[2].day',
    );
  });

  it('treats an unknown entry ID as not found', async () => {
    await expect(
      setWeekEntries(
        db,
        'user_a',
        '2026-W44',
        [{ id: '00000000-0000-4000-8000-000000000000', recipeId: soup.id, servings: 2 }],
        now,
      ),
    ).rejects.toSatisfy((error) => error instanceof NotFoundError && error.entity === 'plan_entry');
  });

  it('refuses an archived recipe for a new entry but keeps an existing one', async () => {
    await setWeekEntries(db, 'user_a', '2026-W44', [{ recipeId: soup.id, servings: 2 }], now);
    await deleteRecipe(db, 'user_a', soup.id);

    await expect(
      setWeekEntries(db, 'user_a', '2026-W45', [{ recipeId: soup.id, servings: 2 }], now),
    ).rejects.toSatisfy((error) => fieldsOf(error) === 'entries[0].recipeId');

    const week = await getWeek(db, 'user_a', '2026-W44', now);
    expect(week.entries).toEqual([expect.objectContaining({ recipeId: soup.id })]);
    expect(week.evaluation.lines.map((line) => line.name)).toEqual(['Cream', 'Onion']);
  });

  it('treats another user’s recipe as not found and stores nothing', async () => {
    await expect(
      setWeekEntries(
        db,
        'user_a',
        '2026-W44',
        [
          { recipeId: soup.id, servings: 2 },
          { recipeId: otherUsersRecipe.id, servings: 2 },
        ],
        now,
      ),
    ).rejects.toSatisfy(
      (error) => error instanceof NotFoundError && error.id === otherUsersRecipe.id,
    );
    expect(await db.select().from(planEntries)).toEqual([]);
  });
});

describe('evaluateCandidateWeek', () => {
  it('evaluates an unsaved candidate without changing the stored week', async () => {
    const saved = await setWeekEntries(
      db,
      'user_a',
      '2026-W44',
      [{ recipeId: stew.id, servings: 2 }],
      now,
    );

    const evaluation = await evaluateCandidateWeek(db, 'user_a', [
      { recipeId: soup.id, servings: 7 },
    ]);

    expect(evaluation.lines).toEqual([
      expect.objectContaining({ name: 'Cream', total: 350, leftover: 50 }),
      expect.objectContaining({ name: 'Onion', total: 3.5 }),
    ]);
    expect(await getWeek(db, 'user_a', '2026-W44', now)).toEqual(saved);
  });

  it('refuses an archived recipe and invalid servings', async () => {
    await deleteRecipe(db, 'user_a', soup.id);

    await expect(
      evaluateCandidateWeek(db, 'user_a', [{ recipeId: soup.id, servings: 2 }]),
    ).rejects.toSatisfy((error) => fieldsOf(error) === 'entries[0].recipeId');
    await expect(
      evaluateCandidateWeek(db, 'user_a', [{ recipeId: stew.id, servings: -1 }]),
    ).rejects.toSatisfy((error) => fieldsOf(error) === 'entries[0].servings');
  });

  it('treats another user’s recipe as not found and reveals none of its ingredients', async () => {
    const result = evaluateCandidateWeek(db, 'user_a', [
      { recipeId: otherUsersRecipe.id, servings: 2 },
    ]);

    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.not.toSatisfy((error) => String(error).includes('Truffle'));
  });
});

describe('snapshotEndedWeeks', () => {
  it('snapshots ended weeks with entries once, and skips empty and current weeks', async () => {
    const ended = await setWeekEntries(
      db,
      'user_a',
      '2026-W40',
      [{ recipeId: soup.id, servings: 2 }],
      now,
    );
    await getWeek(db, 'user_a', '2026-W41', now);
    await setWeekEntries(db, 'user_a', '2026-W44', [{ recipeId: stew.id, servings: 2 }], now);

    const snapshots = await db.select().from(weekSnapshots);
    expect(snapshots).toEqual([
      expect.objectContaining({
        userId: 'user_a',
        weekPlanId: ended.id,
        evaluation: ended.evaluation,
      }),
    ]);

    await setWeekEntries(
      db,
      'user_a',
      '2026-W40',
      [{ id: ended.entries[0].id, recipeId: soup.id, servings: 6 }],
      now,
    );
    await snapshotEndedWeeks(db, 'user_a', new Date('2026-11-30T00:00:00Z'));

    const after = await db.select().from(weekSnapshots);
    expect(after.find((row) => row.weekPlanId === ended.id)).toEqual(snapshots[0]);
    expect(after).toHaveLength(2);
  });

  it('treats a week as ended from the following Monday 00:00 UTC', async () => {
    await setWeekEntries(
      db,
      'user_a',
      '2026-W44',
      [{ recipeId: soup.id, servings: 2 }],
      new Date('2026-11-01T23:59:59Z'),
    );
    expect(await db.select().from(weekSnapshots)).toEqual([]);

    await snapshotEndedWeeks(db, 'user_a', new Date('2026-11-02T00:00:00Z'));

    expect(await db.select().from(weekSnapshots)).toHaveLength(1);
  });

  it('only snapshots the caller’s weeks', async () => {
    await setWeekEntries(
      db,
      'user_a',
      '2026-W40',
      [{ recipeId: soup.id, servings: 2 }],
      new Date('2026-10-01T00:00:00Z'),
    );

    await snapshotEndedWeeks(db, 'user_b', now);

    expect(await db.select().from(weekSnapshots)).toEqual([]);
  });
});
