import { createRecipe, type Recipe } from '@simmery/domain';
import { users } from '@simmery/db';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, fakeSessionAuth, userA, userB } from './testing.js';

let t: Awaited<ReturnType<typeof createTestApp>>;

afterEach(async () => {
  await t.close();
});

const cookieHeader = (value: string) => ({
  cookie: `simmery_session=${encodeURIComponent(value)}`,
});

describe('session guard', () => {
  beforeEach(async () => {
    t = await createTestApp();
  });

  it('rejects /api without a session', async () => {
    const response = await t.request('/api/recipes');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
  });

  it('rejects a signed-out session without touching the cookie', async () => {
    const response = await t.request('/api/recipes', { headers: cookieHeader('signed_out') });
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('answers 503 when the identity provider is unreachable', async () => {
    const response = await t.request('/api/recipes', { headers: cookieHeader('unavailable') });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'auth_unavailable' });
  });

  it('serves a refreshed session and stores the new seal', async () => {
    const response = await t.request('/api/me', {
      headers: cookieHeader(`expired|${userA.id}|${userA.email}`),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(userA);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(decodeURIComponent(cookie)).toContain(`simmery_session=active|${userA.id}|`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('provisions a new user once and reuses the row', async () => {
    await t.request('/api/me', { user: userA });
    await Promise.all([
      t.request('/api/me', { user: userA }),
      t.request('/api/me', { user: userA }),
    ]);
    expect(await t.db.select().from(users)).toHaveLength(1);
  });
});

describe('cross-origin writes', () => {
  let recipe: Recipe;

  beforeEach(async () => {
    t = await createTestApp();
    await t.request('/api/me', { user: userA });
    recipe = await createRecipe(t.db, userA.id, {
      title: 'Toast',
      servings: 1,
      lines: [],
      steps: ['Toast it'],
      tags: [],
    });
    await t.request(`/api/recipes/${recipe.id}`, { user: userA, method: 'DELETE' });
  });

  const archived = async () =>
    (await (await t.request('/api/recipes?archived=true', { user: userA })).json()) as unknown[];

  it('rejects a write from a foreign origin', async () => {
    const response = await t.request(`/api/recipes/${recipe.id}/restore`, {
      user: userA,
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
    expect(await archived()).toHaveLength(1);
  });

  it('rejects a cross-site form post without an Origin header', async () => {
    const response = await t.app.request(`/api/recipes/${recipe.id}/restore`, {
      method: 'POST',
      headers: {
        ...cookieHeader(`active|${userA.id}|${userA.email}`),
        'content-type': 'application/x-www-form-urlencoded',
        'sec-fetch-site': 'cross-site',
      },
      body: 'a=1',
    });
    expect(response.status).toBe(403);
    expect(await archived()).toHaveLength(1);
  });

  it('accepts the same write from the app origin', async () => {
    const response = await t.request(`/api/recipes/${recipe.id}/restore`, {
      user: userA,
      method: 'POST',
    });
    expect(response.status).toBe(204);
    expect(await archived()).toHaveLength(0);
  });
});

describe('errors', () => {
  beforeEach(async () => {
    t = await createTestApp();
  });

  it('answers a malformed JSON body with 400', async () => {
    const response = await t.request('/api/recipes', {
      user: userA,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const malformed = await t.app.request('/api/recipes', {
      method: 'POST',
      headers: {
        origin: 'https://simmery.test',
        'content-type': 'application/json',
        ...cookieHeader(`active|${userA.id}|${userA.email}`),
      },
      body: '{"title":',
    });
    expect(response.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: 'validation' });
  });

  it('logs an unexpected error without its message or parameters', async () => {
    t = await createTestApp({
      auth: {
        ...fakeSessionAuth(),
        resume: async () => ({ status: 'active', user: userA }),
      },
      db: new Proxy(t.db, {
        get(target, key, receiver) {
          if (key === 'insert') {
            return () => {
              throw new Error('Failed query: insert into users\nparams: user_a,a@example.com', {
                cause: Object.assign(new Error('boom a@example.com'), { code: '57P01' }),
              });
            };
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
    });
    const response = await t.request('/api/me', { user: userA });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal' });
    const line = JSON.stringify(t.logs.find((log) => log.msg === 'unhandled error'));
    expect(line).toContain('57P01');
    expect(line).not.toContain('a@example.com');
    expect(line).not.toContain('insert into');
  });

  it('answers an unknown API path with JSON 404', async () => {
    const response = await t.request('/api/nope', { user: userA });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('logs the route pattern, not the raw path', async () => {
    await t.request('/api/share/secret-token');
    const line = t.logs.find((log) => log.msg === 'request');
    expect(line).toMatchObject({ route: '/api/share/:token', status: 404 });
    expect(JSON.stringify(t.logs)).not.toContain('secret-token');
  });
});

describe('probes', () => {
  it('reports health and readiness', async () => {
    t = await createTestApp();
    expect((await t.app.request('/healthz')).status).toBe(200);
    expect((await t.app.request('/readyz')).status).toBe(200);
  });

  it('is not ready when the database is unreachable', async () => {
    t = await createTestApp({
      checkDatabase: () => Promise.reject(new Error('connection refused')),
    });
    expect((await t.app.request('/readyz')).status).toBe(503);
  });
});

describe('web app hosting', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'simmery-web-'));
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'index.html'), '<!doctype html><title>Simmery</title>');
    await writeFile(join(root, 'assets', 'app.js'), 'console.log(1)');
    t = await createTestApp({ webRoot: root });
  });

  afterEach(async () => {
    await rm(root, { recursive: true });
  });

  it('serves the SPA shell for client routes', async () => {
    for (const path of ['/', '/s/some-token', '/some/deep/link']) {
      const response = await t.app.request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<title>Simmery</title>');
    }
    expect((await t.app.request('/s/some-token')).headers.get('cache-control')).toBe('no-cache');
  });

  it('serves hashed assets with a long cache', async () => {
    const response = await t.app.request('/assets/app.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('never answers server paths with the shell', async () => {
    expect((await t.request('/api/nope', { user: userA })).headers.get('content-type')).toContain(
      'application/json',
    );
    expect((await t.app.request('/.well-known/oauth-protected-resource')).status).toBe(404);
  });
});

describe('cross-user access', () => {
  it('only lists the caller’s recipes', async () => {
    t = await createTestApp();
    await t.request('/api/me', { user: userA });
    await t.request('/api/me', { user: userB });
    await createRecipe(t.db, userB.id, { title: 'B', servings: 1, lines: [], steps: [], tags: [] });
    const list = await (await t.request('/api/recipes', { user: userA })).json();
    expect(list).toEqual([]);
  });
});
