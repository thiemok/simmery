import type { UserIdentity } from '@simmery/domain';
import type { WorkOS } from '@workos-inc/node';
import type { ResumeResult, SessionAuth } from './session.js';

/** The part of the WorkOS client the adapter uses, so tests can pass a fake. */
export type WorkOSUserManagement = Pick<
  WorkOS['userManagement'],
  'getAuthorizationUrl' | 'authenticateWithCode' | 'loadSealedSession'
>;

type CookieSession = ReturnType<WorkOSUserManagement['loadSealedSession']>;

export interface WorkOSSessionOptions {
  clientId: string;
  cookiePassword: string;
  redirectUri: string;
  /** How long an old seal keeps resolving to its refreshed successor. */
  refreshReuseMs?: number;
}

const identity = (user: { id: string; email: string }): UserIdentity => ({
  id: user.id,
  email: user.email,
});

/**
 * jose's codes for a JWKS it could not fetch or parse (`ERR_JOSE_GENERIC` covers
 * a non-200 answer). A key the set lacks (`ERR_JWKS_NO_MATCHING_KEY`) is a bad
 * token, not an outage.
 */
const UNREACHABLE_CODES = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC']);

/**
 * Network trouble reaching WorkOS (JWKS fetch, timeouts) as opposed to a
 * cookie that cannot be read: a malformed seal also throws from `authenticate`.
 */
function isUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return (
    (typeof code === 'string' && UNREACHABLE_CODES.has(code)) ||
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    (error instanceof TypeError && error.message === 'fetch failed')
  );
}

export function workosSessionAuth(
  userManagement: WorkOSUserManagement,
  { clientId, cookiePassword, redirectUri, refreshReuseMs = 60_000 }: WorkOSSessionOptions,
): SessionAuth {
  // WorkOS rotates the refresh token on use, so parallel requests carrying the
  // same expired seal must share one refresh; the losers would otherwise fail
  // terminally and sign the user out.
  const refreshes = new Map<string, Promise<ResumeResult>>();

  const load = (sealedSession: string) =>
    userManagement.loadSealedSession({ sessionData: sealedSession, cookiePassword });

  async function authenticate(session: CookieSession) {
    try {
      return await session.authenticate();
    } catch (error) {
      return {
        authenticated: false as const,
        reason: isUnreachable(error) ? 'unreachable' : 'invalid',
      };
    }
  }

  async function refresh(session: CookieSession): Promise<ResumeResult> {
    try {
      const result = await session.refresh();
      if (result.authenticated && result.sealedSession) {
        return {
          status: 'refreshed',
          user: identity(result.user),
          sealedSession: result.sealedSession,
        };
      }
      return { status: !result.authenticated && result.retryable ? 'unavailable' : 'signed_out' };
    } catch {
      return { status: 'unavailable' };
    }
  }

  function sharedRefresh(sealedSession: string, session: CookieSession): Promise<ResumeResult> {
    let pending = refreshes.get(sealedSession);
    if (!pending) {
      pending = refresh(session);
      refreshes.set(sealedSession, pending);
      void pending.then((result) => {
        if (result.status === 'refreshed') {
          setTimeout(() => refreshes.delete(sealedSession), refreshReuseMs).unref();
        } else {
          refreshes.delete(sealedSession);
        }
      });
    }
    return pending;
  }

  return {
    authorizationUrl(state) {
      return userManagement.getAuthorizationUrl({
        provider: 'authkit',
        clientId,
        redirectUri,
        state,
      });
    },

    async signIn(code) {
      const response = await userManagement.authenticateWithCode({
        code,
        clientId,
        session: { sealSession: true, cookiePassword },
      });
      if (!response.sealedSession) {
        throw new Error('WorkOS returned no sealed session');
      }
      return { user: identity(response.user), sealedSession: response.sealedSession };
    },

    async resume(sealedSession) {
      const session = load(sealedSession);
      const result = await authenticate(session);
      if (result.authenticated) {
        return { status: 'active', user: identity(result.user) };
      }
      if (result.reason === 'unreachable') {
        return { status: 'unavailable' };
      }
      if (result.reason === 'invalid_jwt') {
        return sharedRefresh(sealedSession, session);
      }
      return { status: 'signed_out' };
    },

    async logoutUrl(sealedSession) {
      let session = load(sealedSession);
      const result = await authenticate(session);
      if (!result.authenticated) {
        if (result.reason !== 'invalid_jwt') {
          return null;
        }
        // The logout URL needs the session ID from a valid access token.
        const refreshed = await sharedRefresh(sealedSession, session);
        if (refreshed.status !== 'refreshed') {
          return null;
        }
        session = load(refreshed.sealedSession);
      }
      try {
        return await session.getLogoutUrl();
      } catch {
        return null;
      }
    },
  };
}
