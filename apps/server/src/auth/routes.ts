import type { Database } from '@simmery/db';
import { ensureUser } from '@simmery/domain';
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import {
  clearSession,
  readSession,
  takeLoginState,
  writeLoginState,
  writeSession,
  type CookieOptions,
} from './cookies.js';
import type { SessionAuth } from './session.js';

/**
 * Keeps `returnTo` only when it resolves to the app's own origin. A prefix
 * check is not enough: browsers drop tabs and newlines from `Location`, so
 * `/\t/evil.example` lands on `//evil.example`.
 */
export function safeReturnTo(returnTo: string | undefined, publicBaseUrl: string): string {
  // oxlint-disable-next-line no-control-regex
  if (!returnTo || /[\u0000-\u001f\u007f\\]/.test(returnTo)) {
    return '/';
  }
  try {
    const base = new URL(publicBaseUrl);
    const url = new URL(returnTo, base);
    return url.origin === base.origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

export interface AuthRoutesDeps {
  db: Database;
  auth: SessionAuth;
  cookies: CookieOptions;
  publicBaseUrl: string;
}

/**
 * Hosted AuthKit sign-in (KTD3). Invites are enforced in WorkOS, where public
 * sign-up is disabled: an uninvited person never gets a code, so any user
 * WorkOS authenticates is provisioned.
 */
export function authRoutes({ db, auth, cookies, publicBaseUrl }: AuthRoutesDeps) {
  return new Hono()
    .get('/login', (c) => {
      const state = randomBytes(32).toString('base64url');
      const returnTo = safeReturnTo(c.req.query('returnTo'), publicBaseUrl);
      writeLoginState(c, { state, returnTo }, cookies);
      return c.redirect(auth.authorizationUrl(state));
    })
    .get('/callback', async (c) => {
      const login = takeLoginState(c, cookies);
      const code = c.req.query('code');
      if (!login || !code || c.req.query('state') !== login.state) {
        return c.json({ error: 'invalid_login_state' }, 400);
      }
      const { user, sealedSession } = await auth.signIn(code);
      await ensureUser(db, user);
      writeSession(c, sealedSession, cookies);
      return c.redirect(login.returnTo);
    })
    .post('/logout', async (c) => {
      const sealed = readSession(c);
      const logoutUrl = sealed ? await auth.logoutUrl(sealed) : null;
      clearSession(c, cookies);
      return c.redirect(logoutUrl ?? '/', 303);
    });
}
