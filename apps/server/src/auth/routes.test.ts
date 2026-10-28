import { users } from '@simmery/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_URL, createTestApp } from '../testing.js';
import { safeReturnTo } from './routes.js';

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.close();
});

/** Starts a login and returns the state and the cookie that carries it. */
async function startLogin(returnTo?: string) {
  const query = returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`;
  const response = await t.app.request(`/auth/login${query}`);
  const location = new URL(response.headers.get('location') ?? '');
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0];
  return { response, state: location.searchParams.get('state') ?? '', cookie };
}

const callback = (query: string, cookie: string) =>
  t.app.request(`/auth/callback?${query}`, { headers: { cookie } });

describe('auth routes', () => {
  it('redirects to the hosted login with a fresh state', async () => {
    const { response, state, cookie } = await startLogin();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/^https:\/\/auth\.test\/authorize\?state=/);
    expect(state).toHaveLength(43);
    expect(cookie).toMatch(/^simmery_auth=/);
  });

  it('signs in, provisions the user and returns to a same-origin path', async () => {
    const { state, cookie } = await startLogin('/s/abc?x=1');
    const response = await callback(
      `code=${encodeURIComponent('user_a|a@example.com')}&state=${state}`,
      cookie,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/s/abc?x=1');
    expect(decodeURIComponent(response.headers.get('set-cookie') ?? '')).toContain(
      'simmery_session=active|user_a|a@example.com',
    );
    expect(await t.db.select().from(users)).toEqual([
      expect.objectContaining({ id: 'user_a', email: 'a@example.com' }),
    ]);
  });

  it('rejects a callback whose state does not match', async () => {
    const { cookie } = await startLogin();
    const response = await callback('code=user_a|a@example.com&state=forged', cookie);
    expect(response.status).toBe(400);
    expect(await t.db.select().from(users)).toEqual([]);
  });

  it('rejects a callback without the state cookie', async () => {
    const { state } = await startLogin();
    expect((await callback(`code=user_a|a@example.com&state=${state}`, '')).status).toBe(400);
  });

  it('logs out to the provider and clears the session cookie', async () => {
    const response = await t.app.request('/auth/logout', {
      method: 'POST',
      headers: {
        origin: BASE_URL,
        cookie: `simmery_session=${encodeURIComponent('active|user_a|a@example.com')}`,
      },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://auth.test/logout');
    expect(response.headers.get('set-cookie')).toMatch(/simmery_session=;.*Max-Age=0/);
  });

  it('logs out locally when there is no provider session', async () => {
    const response = await t.app.request('/auth/logout', {
      method: 'POST',
      headers: { origin: BASE_URL },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
  });

  it('refuses a cross-origin logout', async () => {
    const response = await t.app.request('/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
  });
});

describe('safeReturnTo', () => {
  it.each([
    ['/s/abc', '/s/abc'],
    ['/recipes?tag=fish#top', '/recipes?tag=fish#top'],
    [`${BASE_URL}/weeks`, '/weeks'],
  ])('keeps %s', (input, expected) => {
    expect(safeReturnTo(input, BASE_URL)).toBe(expected);
  });

  it.each([
    undefined,
    '//evil.example',
    '/\t/evil.example',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
  ])('replaces %s with /', (input) => {
    expect(safeReturnTo(input, BASE_URL)).toBe('/');
  });
});
