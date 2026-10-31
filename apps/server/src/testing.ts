import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createTestDatabase } from '@simmery/db/testing';
import type { UserIdentity } from '@simmery/domain';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import pino from 'pino';
import { Writable } from 'node:stream';
import { createApp, type AppDeps } from './app.js';
import { SESSION_COOKIE } from './auth/cookies.js';
import { authkitBearerAuth } from './auth/jwt.js';
import type { ResumeResult, SessionAuth } from './auth/session.js';

export const BASE_URL = 'https://simmery.test';
export const MCP_URL = `${BASE_URL}/mcp`;
export const AUTHKIT_DOMAIN = 'https://simmery.authkit.test';

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

/** A signing key and its public key set, as the AuthKit JWKS would serve it. */
export async function createSigningKey() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: crypto.randomUUID(), alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });

  /** An AuthKit-shaped access token for `user`; `claims` override the defaults. */
  function tokenFor(user: UserIdentity, claims: JWTPayload = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: AUTHKIT_DOMAIN,
      aud: MCP_URL,
      sub: user.id,
      client_id: 'client_test',
      iat: now,
      exp: now + 300,
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .sign(privateKey);
  }

  return { keys, tokenFor };
}

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
  const { keys, tokenFor } = await createSigningKey();
  /** WorkOS user lookups made by the bearer auth, by user ID. */
  const emailLookups: string[] = [];
  const bearer = authkitBearerAuth({
    issuer: AUTHKIT_DOMAIN,
    resource: MCP_URL,
    keys,
    users: {
      async getUser(userId) {
        emailLookups.push(userId);
        const user = [userA, userB].find((known) => known.id === userId);
        if (!user) {
          throw new Error(`no WorkOS user ${userId}`);
        }
        return user;
      },
    },
  });
  const app = createApp({
    db: testDb.db,
    auth,
    bearer,
    authkitDomain: AUTHKIT_DOMAIN,
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

  /**
   * An MCP client signed in as `user`. Node's `Request` carries no Host
   * header, and `/mcp` rejects requests without the public one.
   */
  async function mcpClient(user: UserIdentity, claims?: JWTPayload) {
    const token = await tokenFor(user, claims);
    const client = new Client({ name: 'simmery-test', version: '0.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(MCP_URL), {
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers);
          headers.set('host', new URL(BASE_URL).host);
          headers.set('authorization', `Bearer ${token}`);
          return app.request(url.toString(), { ...init, headers });
        },
      }),
    );
    return client;
  }

  return {
    app,
    db: testDb.db,
    auth,
    logs,
    emailLookups,
    request,
    tokenFor,
    mcpClient,
    close: () => testDb.close(),
  };
}

export const userA: UserIdentity = { id: 'user_a', email: 'a@example.com' };
export const userB: UserIdentity = { id: 'user_b', email: 'b@example.com' };
