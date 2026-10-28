import { createTestDatabase } from '@simmery/db/testing';
import type { UserIdentity } from '@simmery/domain';
import pino from 'pino';
import { Writable } from 'node:stream';
import { createApp, type AppDeps } from './app.js';
import { SESSION_COOKIE } from './auth/cookies.js';
import type { ResumeResult, SessionAuth } from './auth/session.js';

export const BASE_URL = 'https://simmery.test';

const parseUser = (value: string): UserIdentity => {
  const [id, email] = value.split('|');
  return { id, email };
};

/** A sealed session of the fake: the user it signs in. */
export const sessionOf = (user: UserIdentity) => `active|${user.id}|${user.email}`;

/**
 * Stands in for WorkOS. Cookie values name their outcome: `active|id|email`,
 * `expired|id|email` (refreshes to an active seal), `signed_out`, `unavailable`.
 * A sign-in code is `id|email`.
 */
export function fakeSessionAuth(): SessionAuth {
  return {
    authorizationUrl: (state) => `https://auth.test/authorize?state=${state}`,
    signIn: async (code) => ({ user: parseUser(code), sealedSession: `active|${code}` }),
    async resume(sealed): Promise<ResumeResult> {
      const [kind, ...rest] = sealed.split('|');
      const user = parseUser(rest.join('|'));
      if (kind === 'active') {
        return { status: 'active', user };
      }
      if (kind === 'expired') {
        return { status: 'refreshed', user, sealedSession: sessionOf(user) };
      }
      return { status: kind === 'unavailable' ? 'unavailable' : 'signed_out' };
    },
    logoutUrl: async (sealed) => (sealed.startsWith('active|') ? 'https://auth.test/logout' : null),
  };
}

export type TestAppOptions = Partial<AppDeps>;

/** The app over PGlite and the fake auth, plus the log lines it wrote. */
export async function createTestApp(options: TestAppOptions = {}) {
  const testDb = await createTestDatabase();
  const logs: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      logs.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  const auth = options.auth ?? fakeSessionAuth();
  const app = createApp({
    db: testDb.db,
    auth,
    logger: pino(stream),
    publicBaseUrl: BASE_URL,
    checkDatabase: async () => {},
    ...options,
  });

  /** A same-origin JSON request, signed in as `user` when given. */
  function request(
    path: string,
    {
      user,
      method = 'GET',
      body,
      headers = {},
    }: {
      user?: UserIdentity;
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ) {
    return app.request(path, {
      method,
      headers: {
        origin: BASE_URL,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(user ? { cookie: `${SESSION_COOKIE}=${encodeURIComponent(sessionOf(user))}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  return { app, db: testDb.db, auth, logs, request, close: () => testDb.close() };
}

export const userA: UserIdentity = { id: 'user_a', email: 'a@example.com' };
export const userB: UserIdentity = { id: 'user_b', email: 'b@example.com' };
