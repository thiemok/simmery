import { createIngredient, createRecipe, type Ingredient, type Recipe } from '@simmery/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, userA, userB } from '../testing.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
let flour: Ingredient;
let bRecipe: Recipe;
let bFlour: Ingredient;

beforeEach(async () => {
  t = await createTestApp();
  await t.request('/api/me', { user: userA });
  await t.request('/api/me', { user: userB });
  flour = await createIngredient(t.db, userA.id, { name: 'Flour', canonicalUnit: 'g' });
  bFlour = await createIngredient(t.db, userB.id, { name: 'Flour', canonicalUnit: 'g' });
  bRecipe = await createRecipe(t.db, userB.id, {
    title: 'B bread',
    servings: 2,
    lines: [{ ingredientId: bFlour.id, amount: 500, unit: 'g' }],
    steps: ['Bake'],
    tags: [],
  });
});

afterEach(async () => {
  await t.close();
});

const bread = () => ({
  title: 'Bread',
  servings: 2,
  lines: [{ ingredientId: flour.id, amount: 500, unit: 'g', note: 'sifted' }],
  steps: ['Mix', 'Bake'],
  tags: ['baking'],
});

describe('recipes API', () => {
  it('creates, reads, scales, searches and updates a recipe', async () => {
    const created = await t.request('/api/recipes', { user: userA, method: 'POST', body: bread() });
    expect(created.status).toBe(201);
    const recipe = (await created.json()) as Recipe;
    expect(recipe).toMatchObject({ title: 'Bread', servings: 2, steps: ['Mix', 'Bake'] });

    const scaled = (await (
      await t.request(`/api/recipes/${recipe.id}?servings=3`, { user: userA })
    ).json()) as Recipe;
    expect(scaled.lines[0]).toMatchObject({ amount: 750, canonicalAmount: 750 });

    const found = await (await t.request('/api/recipes?tag=baking', { user: userA })).json();
    expect(found).toEqual([expect.objectContaining({ id: recipe.id })]);

    const updated = await t.request(`/api/recipes/${recipe.id}`, {
      user: userA,
      method: 'PUT',
      body: { ...bread(), title: 'Loaf' },
    });
    expect(await updated.json()).toMatchObject({ title: 'Loaf' });
  });

  it('archives and restores a recipe', async () => {
    const recipe = (await (
      await t.request('/api/recipes', { user: userA, method: 'POST', body: bread() })
    ).json()) as Recipe;
    expect(
      (await t.request(`/api/recipes/${recipe.id}`, { user: userA, method: 'DELETE' })).status,
    ).toBe(204);
    expect(await (await t.request('/api/recipes', { user: userA })).json()).toEqual([]);
    expect(
      (await t.request(`/api/recipes/${recipe.id}/restore`, { user: userA, method: 'POST' }))
        .status,
    ).toBe(204);
    expect(await (await t.request('/api/recipes', { user: userA })).json()).toHaveLength(1);
  });

  it('answers a malformed payload with field paths', async () => {
    const response = await t.request('/api/recipes', {
      user: userA,
      method: 'POST',
      body: {
        ...bread(),
        title: undefined,
        servings: 'two',
        lines: [{ ingredientId: flour.id, amount: '5', unit: 'g' }],
      },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; issues: { field: string }[] };
    expect(body.error).toBe('validation');
    expect(body.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(['title', 'servings', 'lines[0].amount']),
    );
  });

  it('answers a domain rule violation in the same shape', async () => {
    const response = await t.request('/api/recipes', {
      user: userA,
      method: 'POST',
      body: { ...bread(), steps: ['  '] },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'validation',
      issues: [{ field: 'steps[0]', message: 'must not be empty' }],
    });
  });

  it('flags unresolved units per line with 422', async () => {
    const response = await t.request('/api/recipes', {
      user: userA,
      method: 'POST',
      body: { ...bread(), lines: [{ ingredientId: flour.id, amount: 2, unit: 'cup' }] },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'unresolved_units',
      lines: [{ index: 0, unit: 'cup' }],
    });
  });

  it('hides another user’s recipe (AE6)', async () => {
    expect((await t.request(`/api/recipes/${bRecipe.id}`, { user: userA })).status).toBe(404);
    expect(
      (await t.request(`/api/recipes/${bRecipe.id}`, { user: userA, method: 'PUT', body: bread() }))
        .status,
    ).toBe(404);
    expect(
      (await t.request(`/api/recipes/${bRecipe.id}`, { user: userA, method: 'DELETE' })).status,
    ).toBe(404);
    expect(
      await (await t.request(`/api/recipes/${bRecipe.id}`, { user: userB })).json(),
    ).toMatchObject({
      title: 'B bread',
    });
  });

  it('treats a malformed ID as not found', async () => {
    const response = await t.request('/api/recipes/not-a-uuid', { user: userA });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found', entity: 'recipe' });
  });
});

describe('ingredients API', () => {
  it('lists, creates, reads and updates the caller’s ingredients', async () => {
    const created = await t.request('/api/ingredients', {
      user: userA,
      method: 'POST',
      body: { name: 'Garlic', canonicalUnit: 'clove', conversions: [{ unit: 'g', factor: 0.2 }] },
    });
    expect(created.status).toBe(201);
    const garlic = (await created.json()) as Ingredient;
    expect(await (await t.request('/api/ingredients?query=gar', { user: userA })).json()).toEqual([
      garlic,
    ]);
    expect(
      await (await t.request(`/api/ingredients/${garlic.id}`, { user: userA })).json(),
    ).toEqual(garlic);
    const updated = await t.request(`/api/ingredients/${garlic.id}`, {
      user: userA,
      method: 'PUT',
      body: { name: 'Garlic', canonicalUnit: 'clove', packSizes: [10] },
    });
    expect(await updated.json()).toMatchObject({ packSizes: [10] });
  });

  it('answers a duplicate name with 409', async () => {
    const response = await t.request('/api/ingredients', {
      user: userA,
      method: 'POST',
      body: { name: 'flour', canonicalUnit: 'g' },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'conflict', reason: 'duplicate_name' });
  });

  it('hides another user’s ingredient', async () => {
    const response = await t.request(`/api/ingredients/${bFlour.id}`, {
      user: userA,
      method: 'PUT',
      body: { name: 'Mine now', canonicalUnit: 'g' },
    });
    expect(response.status).toBe(404);
    expect(
      await (await t.request(`/api/ingredients/${bFlour.id}`, { user: userB })).json(),
    ).toMatchObject({
      name: 'Flour',
    });
  });
});
