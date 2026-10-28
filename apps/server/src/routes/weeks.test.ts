import {
  createIngredient,
  createRecipe,
  type CookEvent,
  type CookView,
  type Ingredient,
  type Recipe,
  type ShoppingList,
  type Statistics,
  type Week,
  type WeekEvaluation,
} from '@simmery/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, userA, userB } from '../testing.js';

const NOW = new Date('2026-10-28T12:00:00Z');
const WEEK = '2026-W44';

let t: Awaited<ReturnType<typeof createTestApp>>;
let rice: Ingredient;
let curry: Recipe;
let pilaf: Recipe;

beforeEach(async () => {
  t = await createTestApp({ now: () => NOW });
  await t.request('/api/me', { user: userA });
  await t.request('/api/me', { user: userB });
  rice = await createIngredient(t.db, userA.id, { name: 'Rice', canonicalUnit: 'g' });
  const recipe = (title: string) =>
    createRecipe(t.db, userA.id, {
      title,
      servings: 2,
      lines: [{ ingredientId: rice.id, amount: 200, unit: 'g' }],
      steps: ['Cook'],
      tags: ['rice'],
    });
  curry = await recipe('Curry');
  pilaf = await recipe('Pilaf');
});

afterEach(async () => {
  await t.close();
});

const planWeek = async () =>
  (await (
    await t.request(`/api/weeks/${WEEK}/entries`, {
      user: userA,
      method: 'PUT',
      body: {
        entries: [
          { recipeId: curry.id, servings: 2, day: 1 },
          { recipeId: pilaf.id, servings: 4 },
        ],
      },
    })
  ).json()) as Week;

describe('weeks API', () => {
  it('evaluates a candidate week without storing it', async () => {
    const response = await t.request('/api/weeks/evaluate', {
      user: userA,
      method: 'POST',
      body: {
        entries: [
          { recipeId: curry.id, servings: 2 },
          { recipeId: pilaf.id, servings: 2 },
        ],
      },
    });
    const evaluation = (await response.json()) as WeekEvaluation;
    expect(evaluation.overlap).toEqual([expect.objectContaining({ ingredientId: rice.id })]);
    const week = (await (await t.request(`/api/weeks/${WEEK}`, { user: userA })).json()) as Week;
    expect(week.entries).toEqual([]);
  });

  it('plans a week and checks items off the shopping list', async () => {
    const week = await planWeek();
    expect(week.entries.map((entry) => entry.recipeTitle)).toEqual(['Curry', 'Pilaf']);

    const list = (await (
      await t.request(`/api/weeks/${WEEK}/shopping-list`, { user: userA })
    ).json()) as ShoppingList;
    expect(list.items).toEqual([
      expect.objectContaining({ ingredientId: rice.id, total: 600, checked: false }),
    ]);

    const after = (await (
      await t.request(`/api/weeks/${WEEK}/shopping-list/ops`, {
        user: userA,
        method: 'POST',
        body: {
          ops: [
            { type: 'check', ingredientId: rice.id, checked: true, at: '2026-10-28T11:00:00Z' },
            {
              type: 'addExtra',
              id: crypto.randomUUID(),
              text: 'Napkins',
              at: '2026-10-28T11:01:00Z',
            },
          ],
        },
      })
    ).json()) as ShoppingList;
    expect(after.items[0].checked).toBe(true);
    expect(after.extras).toEqual([expect.objectContaining({ text: 'Napkins' })]);
  });

  it('rejects a bad week key and a bad op', async () => {
    expect((await t.request('/api/weeks/2026-44', { user: userA })).status).toBe(400);
    const response = await t.request(`/api/weeks/${WEEK}/shopping-list/ops`, {
      user: userA,
      method: 'POST',
      body: { ops: [{ type: 'check', ingredientId: rice.id, checked: true, at: 'yesterday' }] },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      issues: [expect.objectContaining({ field: 'ops[0].at' })],
    });
  });

  it('refuses to plan another user’s recipe', async () => {
    const response = await t.request(`/api/weeks/${WEEK}/entries`, {
      user: userB,
      method: 'PUT',
      body: { entries: [{ recipeId: curry.id, servings: 2 }] },
    });
    expect(response.status).toBe(404);
  });
});

describe('cooking API', () => {
  it('marks, rates and deletes a cook, and statistics follow', async () => {
    const [entry] = (await planWeek()).entries;
    const view = (await (
      await t.request(`/api/plan-entries/${entry.id}/cook-view`, { user: userA })
    ).json()) as CookView;
    expect(view.recipe.title).toBe('Curry');

    const marked = await t.request(`/api/plan-entries/${entry.id}/cook-events`, {
      user: userA,
      method: 'POST',
      body: { rating: 4 },
    });
    expect(marked.status).toBe(201);
    const event = (await marked.json()) as CookEvent;

    const rated = await t.request(`/api/cook-events/${event.id}/rating`, {
      user: userA,
      method: 'PUT',
      body: { rating: 5 },
    });
    expect(await rated.json()).toMatchObject({ rating: 5 });

    const stats = (await (
      await t.request('/api/statistics', { user: userA })
    ).json()) as Statistics;
    expect(stats.cooks).toEqual([expect.objectContaining({ recipeTitle: 'Curry', rating: 5 })]);

    expect(
      (await t.request(`/api/cook-events/${event.id}`, { user: userA, method: 'DELETE' })).status,
    ).toBe(204);
    const after = (await (
      await t.request('/api/statistics', { user: userA })
    ).json()) as Statistics;
    expect(after.cooks).toEqual([]);
  });

  it('marks a cook without a rating; an out-of-range rating is a field error', async () => {
    const [entry] = (await planWeek()).entries;
    const plain = await t.request(`/api/plan-entries/${entry.id}/cook-events`, {
      user: userA,
      method: 'POST',
      body: {},
    });
    expect(await plain.json()).toMatchObject({ rating: null });
    const bad = await t.request(`/api/plan-entries/${entry.id}/cook-events`, {
      user: userA,
      method: 'POST',
      body: { rating: 6 },
    });
    expect(bad.status).toBe(400);
  });

  it('hides another user’s entries and events (AE6)', async () => {
    const [entry] = (await planWeek()).entries;
    const event = (await (
      await t.request(`/api/plan-entries/${entry.id}/cook-events`, {
        user: userA,
        method: 'POST',
        body: {},
      })
    ).json()) as CookEvent;
    expect(
      (await t.request(`/api/plan-entries/${entry.id}/cook-view`, { user: userB })).status,
    ).toBe(404);
    expect(
      (
        await t.request(`/api/cook-events/${event.id}/rating`, {
          user: userB,
          method: 'PUT',
          body: { rating: 1 },
        })
      ).status,
    ).toBe(404);
    expect(
      (await t.request(`/api/cook-events/${event.id}`, { user: userB, method: 'DELETE' })).status,
    ).toBe(404);
    const stats = (await (
      await t.request('/api/statistics', { user: userB })
    ).json()) as Statistics;
    expect(stats.cooks).toEqual([]);
  });
});
