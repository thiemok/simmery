import { createIngredient, createRecipe, type Recipe, type ShareLink } from '@simmery/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, userA, userB } from '../testing.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
let bread: Recipe;

beforeEach(async () => {
  t = await createTestApp();
  await t.request('/api/me', { user: userA });
  await t.request('/api/me', { user: userB });
  const flour = await createIngredient(t.db, userA.id, { name: 'Flour', canonicalUnit: 'g' });
  bread = await createRecipe(t.db, userA.id, {
    title: 'Bread',
    servings: 1,
    lines: [{ ingredientId: flour.id, amount: 500, unit: 'g' }],
    steps: ['Bake'],
    tags: [],
  });
});

afterEach(async () => {
  await t.close();
});

const share = async () =>
  (await (
    await t.request(`/api/recipes/${bread.id}/share-links`, { user: userA, method: 'POST' })
  ).json()) as ShareLink;

describe('sharing API', () => {
  it('shares a recipe publicly without IDs (R23)', async () => {
    const link = await share();
    expect(
      await (await t.request(`/api/recipes/${bread.id}/share-links`, { user: userA })).json(),
    ).toEqual([expect.objectContaining({ id: link.id })]);
    const response = await t.request(`/api/share/${link.token}`);
    expect(response.status).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).toContain('Bread');
    expect(body).not.toContain(bread.id);
    expect(body).not.toContain(userA.id);
  });

  it('answers a revoked link with 410 and an unknown one with 404 (AE5)', async () => {
    const link = await share();
    expect(
      (await t.request(`/api/share-links/${link.id}`, { user: userA, method: 'DELETE' })).status,
    ).toBe(204);
    expect((await t.request(`/api/share/${link.token}`)).status).toBe(410);
    expect(await (await t.request(`/api/share/${link.token}`)).json()).toEqual({
      error: 'no_longer_shared',
    });
    expect((await t.request('/api/share/unknown')).status).toBe(404);
  });

  it('imports a shared recipe only with a session (R24)', async () => {
    const link = await share();
    const body = { lines: [{ newIngredient: { name: 'Flour', canonicalUnit: 'g' } }] };
    expect(
      (await t.request(`/api/share/${link.token}/import`, { method: 'POST', body })).status,
    ).toBe(401);
    const response = await t.request(`/api/share/${link.token}/import`, {
      user: userB,
      method: 'POST',
      body,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ title: 'Bread', imported: true });
    expect(await (await t.request('/api/recipes', { user: userB })).json()).toHaveLength(1);
  });

  it('hides another user’s links (AE6)', async () => {
    const link = await share();
    expect((await t.request(`/api/recipes/${bread.id}/share-links`, { user: userB })).status).toBe(
      404,
    );
    expect(
      (await t.request(`/api/share-links/${link.id}`, { user: userB, method: 'DELETE' })).status,
    ).toBe(404);
    expect((await t.request(`/api/share/${link.token}`)).status).toBe(200);
  });
});

describe('profile and account API', () => {
  it('replaces and reads the taste profile per user', async () => {
    expect(await (await t.request('/api/taste-profile', { user: userA })).json()).toEqual({
      body: '',
      updatedAt: null,
    });
    await t.request('/api/taste-profile', {
      user: userA,
      method: 'PUT',
      body: { body: '- no coriander\n' },
    });
    expect(await (await t.request('/api/taste-profile', { user: userA })).json()).toMatchObject({
      body: '- no coriander\n',
    });
    expect(await (await t.request('/api/taste-profile', { user: userB })).json()).toMatchObject({
      body: '',
    });
  });

  it('returns the signed-in user', async () => {
    expect(await (await t.request('/api/me', { user: userB })).json()).toEqual(userB);
  });
});
