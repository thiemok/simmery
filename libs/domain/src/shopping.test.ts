import { users, weekSnapshots, type Database } from '@simmery/db';
import { createTestDatabase, type TestDatabase } from '@simmery/db/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIngredient, type Ingredient } from './catalog.js';
import { ValidationError } from './errors.js';
import { setWeekEntries } from './planning.js';
import { createRecipe, type Recipe } from './recipes.js';
import { applyListOps, getShoppingList } from './shopping.js';

const now = new Date('2026-10-28T12:00:00Z');
const at = (minute: number) => new Date(Date.UTC(2026, 9, 28, 10, minute));
const extraId = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

let testDb: TestDatabase;
let db: Database;
let onion: Ingredient;
let cream: Ingredient;
let coriander: Ingredient;
let soup: Recipe;
let tacos: Recipe;

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
  coriander = await createIngredient(db, 'user_a', { name: 'Coriander', canonicalUnit: 'g' });
  soup = await createRecipe(db, 'user_a', {
    title: 'Onion soup',
    servings: 2,
    lines: [
      { ingredientId: onion.id, amount: 1, unit: 'piece' },
      { ingredientId: cream.id, amount: 100, unit: 'ml' },
    ],
    steps: ['Cook'],
    tags: [],
  });
  tacos = await createRecipe(db, 'user_a', {
    title: 'Tacos',
    servings: 2,
    lines: [{ ingredientId: coriander.id, amount: 5, unit: 'g' }],
    steps: ['Fill'],
    tags: [],
  });
  await setWeekEntries(
    db,
    'user_a',
    '2026-W44',
    [
      { recipeId: soup.id, servings: 7 },
      { recipeId: tacos.id, servings: 4 },
    ],
    now,
  );
});

afterEach(async () => {
  await testDb.close();
});

describe('getShoppingList', () => {
  it('Covers AE2, AE3. lists summed totals with no leftovers or packs', async () => {
    const list = await getShoppingList(db, 'user_a', '2026-W44', now);

    expect(list).toEqual({
      weekKey: '2026-W44',
      items: [
        { ingredientId: coriander.id, name: 'Coriander', unit: 'g', total: 10, checked: false },
        { ingredientId: cream.id, name: 'Cream', unit: 'ml', total: 350, checked: false },
        { ingredientId: onion.id, name: 'Onion', unit: 'piece', total: 3.5, checked: false },
      ],
      extras: [],
    });
  });

  it('snapshots the week when it is read after the week ended, not before', async () => {
    await getShoppingList(db, 'user_a', '2026-W44', now);
    expect(await db.select().from(weekSnapshots)).toEqual([]);

    await getShoppingList(db, 'user_a', '2026-W44', new Date('2026-11-02T08:00:00Z'));
    expect(await db.select().from(weekSnapshots)).toHaveLength(1);
  });

  it('rejects an invalid week key', async () => {
    await expect(getShoppingList(db, 'user_a', 'next week', now)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('applyListOps', () => {
  it('checks a line by its ingredient ID', async () => {
    const list = await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: onion.id, checked: true, at: at(1) }],
      now,
    );

    expect(list.items.find((item) => item.ingredientId === onion.id)?.checked).toBe(true);
  });

  it('keeps the later client timestamp regardless of arrival order', async () => {
    await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: onion.id, checked: false, at: at(5) }],
      now,
    );
    const list = await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: onion.id, checked: true, at: at(2) }],
      now,
    );

    expect(list.items.find((item) => item.ingredientId === onion.id)?.checked).toBe(false);
  });

  it('applies ops in one batch by client timestamp, not by position', async () => {
    const list = await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [
        { type: 'check', ingredientId: cream.id, checked: false, at: at(9) },
        { type: 'check', ingredientId: cream.id, checked: true, at: at(3) },
      ],
      now,
    );

    expect(list.items.find((item) => item.ingredientId === cream.id)?.checked).toBe(false);
  });

  it('does not change an item for an op with the same timestamp as its state', async () => {
    await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: onion.id, checked: true, at: at(4) }],
      now,
    );
    const list = await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: onion.id, checked: false, at: at(4) }],
      now,
    );

    expect(list.items.find((item) => item.ingredientId === onion.id)?.checked).toBe(true);
  });

  it('caps a future timestamp at now so a later real op still wins', async () => {
    await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: onion.id, checked: true, at: new Date('2030-01-01') }],
      now,
    );
    const later = new Date(now.getTime() + 60_000);
    const list = await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: onion.id, checked: false, at: later }],
      later,
    );

    expect(list.items.find((item) => item.ingredientId === onion.id)?.checked).toBe(false);
  });

  it('ignores an op for an item no longer on the list', async () => {
    await setWeekEntries(db, 'user_a', '2026-W44', [{ recipeId: tacos.id, servings: 2 }], now);

    const list = await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [
        { type: 'check', ingredientId: onion.id, checked: true, at: at(1) },
        { type: 'renameExtra', id: extraId, text: 'Bread', at: at(2) },
        { type: 'check', ingredientId: 'not-a-uuid', checked: true, at: at(3) },
      ],
      now,
    );

    expect(list.items.map((item) => item.ingredientId)).toEqual([coriander.id]);
    expect(list.extras).toEqual([]);
  });

  it('adds, renames, checks and removes extras, which survive plan changes', async () => {
    const otherId = '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a';
    await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [
        { type: 'addExtra', id: extraId, text: ' Bread ', at: at(1) },
        { type: 'addExtra', id: otherId, text: 'Napkins', at: at(2) },
        { type: 'renameExtra', id: extraId, text: 'Sourdough', at: at(3) },
        { type: 'checkExtra', id: otherId, checked: true, at: at(4) },
      ],
      now,
    );
    await setWeekEntries(db, 'user_a', '2026-W44', [], now);

    let list = await getShoppingList(db, 'user_a', '2026-W44', now);
    expect(list.items).toEqual([]);
    expect(list.extras).toEqual([
      { id: extraId, text: 'Sourdough', checked: false },
      { id: otherId, text: 'Napkins', checked: true },
    ]);

    list = await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [
        { type: 'removeExtra', id: otherId, at: at(5) },
        { type: 'addExtra', id: extraId, text: 'Bread', at: at(1) },
      ],
      now,
    );
    expect(list.extras).toEqual([{ id: extraId, text: 'Sourdough', checked: false }]);
  });

  it('rejects an extra without text or with a malformed ID, and an invalid timestamp', async () => {
    await expect(
      applyListOps(
        db,
        'user_a',
        '2026-W44',
        [
          { type: 'addExtra', id: extraId, text: '  ', at: at(1) },
          { type: 'addExtra', id: 'temp-1', text: 'Milk', at: at(1) },
          { type: 'check', ingredientId: onion.id, checked: true, at: new Date('nope') },
        ],
        now,
      ),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ValidationError &&
        error.issues.map((issue) => issue.field).join() === 'ops[0].text,ops[1].id,ops[2].at',
    );
  });

  it('writes exactly one snapshot on the first check-off and never overwrites it', async () => {
    await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'addExtra', id: extraId, text: 'Bread', at: at(1) }],
      now,
    );
    expect(await db.select().from(weekSnapshots)).toEqual([]);

    await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: onion.id, checked: true, at: at(2) }],
      now,
    );
    const [snapshot] = await db.select().from(weekSnapshots);
    expect(snapshot.evaluation).toMatchObject({
      lines: [
        expect.objectContaining({ name: 'Coriander' }),
        expect.objectContaining({ name: 'Cream', leftover: 50 }),
        expect.objectContaining({ name: 'Onion' }),
      ],
    });

    await setWeekEntries(db, 'user_a', '2026-W44', [{ recipeId: tacos.id, servings: 2 }], now);
    await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'check', ingredientId: coriander.id, checked: true, at: at(3) }],
      now,
    );
    expect(await db.select().from(weekSnapshots)).toEqual([snapshot]);
  });

  it('writes no snapshot for a check-off on a week without entries', async () => {
    await applyListOps(
      db,
      'user_a',
      '2026-W45',
      [
        { type: 'addExtra', id: extraId, text: 'Bread', at: at(1) },
        { type: 'checkExtra', id: extraId, checked: true, at: at(2) },
      ],
      now,
    );
    expect(await db.select().from(weekSnapshots)).toEqual([]);

    await setWeekEntries(db, 'user_a', '2026-W45', [{ recipeId: tacos.id, servings: 2 }], now);
    await applyListOps(
      db,
      'user_a',
      '2026-W45',
      [{ type: 'check', ingredientId: coriander.id, checked: true, at: at(3) }],
      now,
    );
    const [snapshot] = await db.select().from(weekSnapshots);
    expect(snapshot.evaluation).toMatchObject({
      lines: [expect.objectContaining({ name: 'Coriander' })],
    });
  });

  it('keeps users’ lists apart', async () => {
    await applyListOps(
      db,
      'user_a',
      '2026-W44',
      [{ type: 'addExtra', id: extraId, text: 'Bread', at: at(1) }],
      now,
    );

    const list = await applyListOps(
      db,
      'user_b',
      '2026-W44',
      [
        { type: 'check', ingredientId: onion.id, checked: true, at: at(2) },
        { type: 'addExtra', id: extraId, text: 'Hijacked', at: at(3) },
        { type: 'renameExtra', id: extraId, text: 'Hijacked', at: at(4) },
        { type: 'removeExtra', id: extraId, at: at(5) },
      ],
      now,
    );

    expect(list).toEqual({ weekKey: '2026-W44', items: [], extras: [] });
    const own = await getShoppingList(db, 'user_a', '2026-W44', now);
    expect(own.extras).toEqual([{ id: extraId, text: 'Bread', checked: false }]);
    expect(own.items.every((item) => !item.checked)).toBe(true);
  });
});
