import type { Database } from '@simmery/db';
import { ensureUser } from '@simmery/domain';
import { createMiddleware } from 'hono/factory';
import { readSession, writeSession, type CookieOptions } from './cookies.js';
import type { SessionAuth } from './session.js';

export interface AuthEnv {
  Variables: { userId: string };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence next to SameSite=Lax: a cookie-carrying write must come from
 * the app's own origin. Content type is no defence, because Hono validates
 * `{}` for a non-JSON body and several writes have no body.
 */
export function sameOrigin(publicOrigin: string) {
  return createMiddleware(async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      const allowed =
        origin === undefined
          ? c.req.header('sec-fetch-site') === 'same-origin'
          : origin === publicOrigin;
      if (!allowed) {
        return c.json({ error: 'forbidden_origin' }, 403);
      }
    }
    return next();
  });
}

/**
 * Resolves the session cookie to a local user (KTD4). A dead cookie is left
 * in place: clearing it here could overwrite a cookie a parallel request just
 * refreshed, and the next sign-in replaces it anyway.
 */
export function requireSession(db: Database, auth: SessionAuth, cookies: CookieOptions) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const sealed = readSession(c);
    if (!sealed) {
      return c.json({ error: 'unauthenticated' }, 401);
    }
    const session = await auth.resume(sealed);
    if (session.status === 'signed_out') {
      return c.json({ error: 'unauthenticated' }, 401);
    }
    if (session.status === 'unavailable') {
      return c.json({ error: 'auth_unavailable' }, 503);
    }
    if (session.status === 'refreshed') {
      writeSession(c, session.sealedSession, cookies);
    }
    await ensureUser(db, session.user);
    c.set('userId', session.user.id);
    return next();
  });
}
