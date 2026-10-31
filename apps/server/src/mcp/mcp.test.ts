import type { Client } from '@modelcontextprotocol/client';
import {
  createIngredient,
  createRecipe,
  getRecipe,
  getUser,
  getWeek,
  markCooked,
  type Ingredient,
  type Recipe,
  type RecipeInput,
} from '@simmery/domain';
import { errors } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authkitBearerAuth } from '../auth/jwt.js';
import {
  AUTHKIT_DOMAIN,
  BASE_URL,
  MCP_URL,
  createSigningKey,
  createTestApp,
  userA,
  userB,
} from '../testing.js';

const WEEK = '2026-W44';
const host = new URL(BASE_URL).host;

let t: Awaited<ReturnType<typeof createTestApp>>;
let clients: Client[];

beforeEach(async () => {
  t = await createTestApp({ now: () => new Date('2026-10-28T12:00:00Z') });
  clients = [];
});

afterEach(async () => {
  await Promise.all(clients.map((client) => client.close()));
  await t.close();
});

async function connect(user = userA) {
  const client = await t.mcpClient(user);
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  return {
    isError: result.isError === true,
    value: result.structuredContent as Record<string, unknown> & { items?: unknown[] },
  };
}

/** A raw JSON-RPC `tools/list` against `/mcp`, outside the SDK client. */
function post(headers: Record<string, string>) {
  return t.app.request(MCP_URL, {
    method: 'POST',
    headers: {
      host,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

const bearer = async (claims: Parameters<typeof t.tokenFor>[1] = {}) => ({
  authorization: `Bearer ${await t.tokenFor(userA, claims)}`,
});

describe('MCP authorization', () => {
  it('challenges a request without a token with the protected-resource metadata URL', async () => {
    const response = await post({});
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it('serves the protected-resource metadata without auth', async () => {
    for (const path of [
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-protected-resource',
    ]) {
      const response = await t.app.request(path);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        resource: MCP_URL,
        authorization_servers: [AUTHKIT_DOMAIN],
        bearer_methods_supported: ['header'],
      });
    }
  });

  it('rejects tokens with the wrong audience, issuer or expiry with 401', async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const claims of [
      { aud: 'client_test' },
      { iss: 'https://evil.authkit.test' },
      { exp: now - 60, iat: now - 120 },
    ]) {
      const response = await post(await bearer(claims));
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain('invalid_token');
    }
  });

  it('rejects a token signed by another key, an unsigned token and a malformed one with 401', async () => {
    const other = await createSigningKey();
    const unsigned = [
      Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({ iss: AUTHKIT_DOMAIN, aud: MCP_URL, sub: userA.id, exp: 2e9 }),
      ).toString('base64url'),
      '',
    ].join('.');
    for (const token of [await other.tokenFor(userA), unsigned, 'not-a-jwt']) {
      expect((await post({ authorization: `Bearer ${token}` })).status).toBe(401);
    }
  });

  it('answers 503 when the AuthKit key set cannot be fetched', async () => {
    const down = await createTestApp({
      bearer: authkitBearerAuth({
        issuer: AUTHKIT_DOMAIN,
        resource: MCP_URL,
        keys: async () => {
          throw new errors.JWKSTimeout();
        },
        users: { getUser: async () => userA },
      }),
    });
    try {
      const response = await down.app.request(MCP_URL, {
        method: 'POST',
        headers: { host, authorization: `Bearer ${await t.tokenFor(userA)}` },
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'auth_unavailable' });
    } finally {
      await down.close();
    }
  });

  it('rejects a foreign Host before auth', async () => {
    const response = await post({ ...(await bearer()), host: 'evil.example' });
    expect(response.status).toBe(403);
  });

  it('provisions a new user once, reading the email from WorkOS on first contact only', async () => {
    expect(await getUser(t.db, userA.id)).toBeUndefined();
    await connect();
    expect(await getUser(t.db, userA.id)).toEqual(userA);
    const lookups = t.emailLookups.length;
    await call(await connect(), 'get_taste_profile');
    expect(t.emailLookups).toEqual(Array(lookups).fill(userA.id));
  });

  it('answers 503 and creates no user when WorkOS cannot return the email', async () => {
    const response = await post({
      authorization: `Bearer ${await t.tokenFor({ id: 'user_unknown', email: '' })}`,
    });
    expect(response.status).toBe(503);
    expect(await getUser(t.db, 'user_unknown')).toBeUndefined();
  });
});

describe('MCP tools', () => {
  let garlic: Ingredient;
  let cream: Ingredient;

  beforeEach(async () => {
    await connect(userA);
    garlic = await createIngredient(t.db, userA.id, { name: 'Garlic', canonicalUnit: 'clove' });
    cream = await createIngredient(t.db, userA.id, {
      name: 'Cream',
      canonicalUnit: 'ml',
      packSizes: [200, 500],
    });
  });

  const recipe = (title: string, lines: RecipeInput['lines']) => ({
    title,
    servings: 2,
    lines,
    steps: ['Cook'],
    tags: ['pasta'],
  });

  it('lists the documented tool set with descriptions and convertible input schemas', async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'delete_recipe',
      'evaluate_week',
      'get_cook_history',
      'get_recipe',
      'get_shopping_list',
      'get_statistics',
      'get_taste_profile',
      'get_week',
      'list_ingredients',
      'save_recipe',
      'search_recipes',
      'set_week_entries',
      'update_taste_profile',
      'upsert_ingredient',
    ]);
    expect(tools.every((tool) => (tool.description ?? '').length > 20)).toBe(true);
    const saveRecipe = JSON.stringify(tools.find((tool) => tool.name === 'save_recipe'));
    expect(saveRecipe).toContain('ingredientId');
    expect(saveRecipe).toContain('newIngredient');
  });

  it('Covers F3. resolves an unresolved unit through a conversion and saves the recipe', async () => {
    const client = await connect();
    const aglio = recipe('Aglio e olio', [
      { ingredientId: garlic.id, amount: 50, unit: 'g' },
      { newIngredient: { name: 'Spaghetti', canonicalUnit: 'g' }, amount: 200, unit: 'g' },
    ]);

    const flagged = await call(client, 'save_recipe', { recipe: aglio });
    expect(flagged).toEqual({
      isError: true,
      value: { error: 'unresolved_units', lines: [{ index: 0, unit: 'g' }] },
    });

    const conversion = await call(client, 'upsert_ingredient', {
      id: garlic.id,
      name: 'Garlic',
      canonicalUnit: 'clove',
      conversions: [{ unit: 'g', factor: 0.2 }],
    });
    expect(conversion.isError).toBe(false);

    const saved = await call(client, 'save_recipe', { recipe: aglio });
    expect(saved.isError).toBe(false);
    expect(saved.value).toMatchObject({
      title: 'Aglio e olio',
      lines: [
        { ingredientName: 'Garlic', canonicalAmount: 10, canonicalUnit: 'clove' },
        { ingredientName: 'Spaghetti', canonicalAmount: 200 },
      ],
    });
    const catalog = await call(client, 'list_ingredients', { query: 'spag' });
    expect(catalog.value.items).toEqual([expect.objectContaining({ name: 'Spaghetti' })]);
  });

  it('the recipes API still rejects a line naming an ingredient and a new one', async () => {
    const response = await t.request('/api/recipes', {
      user: userA,
      method: 'POST',
      body: {
        ...recipe('Both', []),
        lines: [
          {
            ingredientId: garlic.id,
            newIngredient: { name: 'Shallot', canonicalUnit: 'piece' },
            amount: 1,
            unit: 'clove',
          },
        ],
      },
    });
    expect(response.status).toBe(400);
  });

  it('Covers F1. evaluates a candidate week without saving it, then saves it', async () => {
    const client = await connect();
    const sauce = await createRecipe(
      t.db,
      userA.id,
      recipe('Sauce', [{ ingredientId: cream.id, amount: 150, unit: 'ml' }]),
    );
    const soup = await createRecipe(
      t.db,
      userA.id,
      recipe('Soup', [{ ingredientId: cream.id, amount: 200, unit: 'ml' }]),
    );
    const entries = [
      { recipeId: sauce.id, servings: 2 },
      { recipeId: soup.id, servings: 2 },
    ];

    const evaluation = await call(client, 'evaluate_week', { entries });
    expect(evaluation.isError).toBe(false);
    expect(evaluation.value).toMatchObject({
      overlap: [expect.objectContaining({ ingredientId: cream.id, total: 350, leftover: 50 })],
    });
    expect((await getWeek(t.db, userA.id, WEEK)).entries).toEqual([]);

    const saved = await call(client, 'set_week_entries', { weekKey: WEEK, entries });
    expect(saved.isError).toBe(false);
    const week = await call(client, 'get_week', { weekKey: WEEK });
    expect(week.value.entries).toHaveLength(2);
    const list = await call(client, 'get_shopping_list', { weekKey: WEEK });
    expect(list.value).toMatchObject({
      items: [expect.objectContaining({ ingredientId: cream.id, total: 350 })],
    });

    const [cooked] = (week.value.entries as { id: string }[]) ?? [];
    await markCooked(t.db, userA.id, cooked.id, { rating: 5 });
    const removed = await call(client, 'set_week_entries', { weekKey: WEEK, entries: [] });
    expect(removed).toEqual({
      isError: true,
      value: { error: 'conflict', reason: 'entry_cooked' },
    });

    const history = await call(client, 'get_cook_history');
    expect(history.value.cooks).toEqual([expect.objectContaining({ rating: 5 })]);
    const statistics = await call(client, 'get_statistics');
    expect(Object.keys(statistics.value).sort()).toEqual(['mostBought', 'weeks']);
  });

  it('scales, archives and searches recipes', async () => {
    const client = await connect();
    const sauce = await createRecipe(
      t.db,
      userA.id,
      recipe('Sauce', [{ ingredientId: cream.id, amount: 150, unit: 'ml' }]),
    );
    const scaled = await call(client, 'get_recipe', { id: sauce.id, servings: 4 });
    expect(scaled.value).toMatchObject({ servings: 4, lines: [{ amount: 300 }] });

    expect((await call(client, 'delete_recipe', { id: sauce.id })).isError).toBe(false);
    expect((await call(client, 'search_recipes')).value.items).toEqual([]);
    expect((await call(client, 'search_recipes', { archived: true })).value.items).toEqual([
      expect.objectContaining({ id: sauce.id }),
    ]);
  });

  it('replaces and reads the taste profile', async () => {
    const client = await connect();
    await call(client, 'update_taste_profile', { body: 'No coriander.' });
    expect((await call(client, 'get_taste_profile')).value).toMatchObject({
      body: 'No coriander.',
    });
  });

  it('returns validation errors in the API shape', async () => {
    const result = await call(await connect(), 'save_recipe', {
      recipe: recipe('', [{ ingredientId: garlic.id, amount: 1, unit: 'clove' }]),
    });
    expect(result).toEqual({
      isError: true,
      value: { error: 'validation', issues: [expect.objectContaining({ field: 'title' })] },
    });
  });

  it('hides an unexpected error behind internal, in the result and the log', async () => {
    // Postgres refuses NUL in text; drizzle's error message then embeds the parameters.
    const result = await call(await connect(), 'update_taste_profile', {
      body: 'mail a@example.com\u0000',
    });
    expect(result).toEqual({ isError: true, value: { error: 'internal' } });
    const logged = JSON.stringify(t.logs);
    expect(logged).toContain('tool failed');
    expect(logged).not.toContain('a@example.com');
  });

  describe('Covers AE6. cross-user isolation', () => {
    let bRecipe: Recipe;
    let bGarlic: Ingredient;

    beforeEach(async () => {
      await connect(userB);
      bGarlic = await createIngredient(t.db, userB.id, { name: 'Garlic', canonicalUnit: 'clove' });
      bRecipe = await createRecipe(
        t.db,
        userB.id,
        recipe('B soup', [{ ingredientId: bGarlic.id, amount: 2, unit: 'clove' }]),
      );
    });

    it("refuses user B's rows to user A and leaves them unchanged", async () => {
      const client = await connect(userA);
      const notFound = (entity: string) => ({
        isError: true,
        value: { error: 'not_found', entity },
      });

      expect(await call(client, 'get_recipe', { id: bRecipe.id })).toEqual(notFound('recipe'));
      expect(
        await call(client, 'save_recipe', {
          id: bRecipe.id,
          recipe: recipe('Hijack', [{ ingredientId: garlic.id, amount: 1, unit: 'clove' }]),
        }),
      ).toEqual(notFound('recipe'));
      expect(
        await call(client, 'upsert_ingredient', {
          id: bGarlic.id,
          name: 'Hijack',
          canonicalUnit: 'clove',
        }),
      ).toEqual(notFound('ingredient'));
      expect(
        await call(client, 'set_week_entries', {
          weekKey: WEEK,
          entries: [{ recipeId: bRecipe.id, servings: 2 }],
        }),
      ).toEqual(notFound('recipe'));
      expect((await call(client, 'search_recipes')).value.items).toEqual([]);

      expect(await getRecipe(t.db, userB.id, bRecipe.id)).toMatchObject({ title: 'B soup' });
      expect((await getWeek(t.db, userA.id, WEEK)).entries).toEqual([]);
    });
  });
});
