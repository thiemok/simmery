import { describe, expect, it, vi } from 'vitest';
import { workosSessionAuth, type WorkOSUserManagement } from './workos.js';

const user = { id: 'user_a', email: 'a@example.com' };

type Authenticate = () => Promise<
  { authenticated: true; user: typeof user } | { authenticated: false; reason: string }
>;
type Refresh = () => Promise<
  | { authenticated: true; user: typeof user; sealedSession: string }
  | { authenticated: false; reason: string; retryable: boolean }
>;

/** A WorkOS user-management stand-in whose sessions behave per seal. */
function fakeWorkOS(sessions: Record<string, { authenticate: Authenticate; refresh?: Refresh }>) {
  const refresh = vi.fn<(seal: string) => void>();
  const userManagement = {
    getAuthorizationUrl: ({ state }: { state?: string }) => `https://auth.test/?state=${state}`,
    authenticateWithCode: async () => ({ user, sealedSession: 'seal-new' }),
    loadSealedSession: ({ sessionData }: { sessionData: string }) => {
      const session = sessions[sessionData] ?? {
        authenticate: async () => ({ authenticated: false, reason: 'invalid_session_cookie' }),
      };
      return {
        authenticate: session.authenticate,
        refresh: async () => {
          refresh(sessionData);
          return session.refresh!();
        },
        getLogoutUrl: async () => {
          const result = await session.authenticate();
          if (!result.authenticated) {
            throw new Error(`Failed to extract session ID for logout URL: ${result.reason}`);
          }
          return `https://auth.test/logout?seal=${sessionData}`;
        },
      };
    },
  } as unknown as WorkOSUserManagement;
  const auth = workosSessionAuth(userManagement, {
    clientId: 'client_x',
    cookiePassword: 'x'.repeat(32),
    redirectUri: 'https://simmery.test/auth/callback',
  });
  return { auth, refresh };
}

const active: Authenticate = async () => ({ authenticated: true, user });
const expired: Authenticate = async () => ({ authenticated: false, reason: 'invalid_jwt' });
const refreshesTo =
  (sealedSession: string): Refresh =>
  async () => ({ authenticated: true, user, sealedSession });

describe('workosSessionAuth', () => {
  it('resumes an active session', async () => {
    const { auth } = fakeWorkOS({ seal: { authenticate: active } });
    expect(await auth.resume('seal')).toEqual({ status: 'active', user });
  });

  it('refreshes an expired access token', async () => {
    const { auth } = fakeWorkOS({
      old: { authenticate: expired, refresh: refreshesTo('new') },
    });
    expect(await auth.resume('old')).toEqual({ status: 'refreshed', user, sealedSession: 'new' });
  });

  it('shares one refresh between parallel requests with the same expired seal', async () => {
    let calls = 0;
    const { auth, refresh } = fakeWorkOS({
      old: {
        authenticate: expired,
        // A second use of the rotated refresh token would fail terminally.
        refresh: async () =>
          ++calls === 1
            ? { authenticated: true, user, sealedSession: 'new' }
            : { authenticated: false, reason: 'invalid_grant', retryable: false },
      },
    });
    const results = await Promise.all([auth.resume('old'), auth.resume('old'), auth.resume('old')]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(
      results.every((result) => result.status === 'refreshed' && result.sealedSession === 'new'),
    ).toBe(true);
    expect(await auth.resume('old')).toMatchObject({ sealedSession: 'new' });
  });

  it('signs out on a terminal refresh failure', async () => {
    const { auth } = fakeWorkOS({
      old: {
        authenticate: expired,
        refresh: async () => ({ authenticated: false, reason: 'invalid_grant', retryable: false }),
      },
    });
    expect(await auth.resume('old')).toEqual({ status: 'signed_out' });
  });

  it('keeps the session on a retryable refresh failure', async () => {
    const { auth } = fakeWorkOS({
      old: {
        authenticate: expired,
        refresh: async () => ({ authenticated: false, reason: 'server_error', retryable: true }),
      },
    });
    expect(await auth.resume('old')).toEqual({ status: 'unavailable' });
  });

  it('reports WorkOS as unavailable when the JWKS cannot be fetched', async () => {
    const { auth } = fakeWorkOS({
      seal: {
        authenticate: async () => {
          throw new TypeError('fetch failed');
        },
      },
    });
    expect(await auth.resume('seal')).toEqual({ status: 'unavailable' });
  });

  it('signs out an unreadable cookie', async () => {
    const { auth } = fakeWorkOS({
      broken: {
        authenticate: async () => {
          throw new Error('Invalid expiration');
        },
      },
    });
    expect(await auth.resume('garbage')).toEqual({ status: 'signed_out' });
    expect(await auth.resume('broken')).toEqual({ status: 'signed_out' });
  });

  it('builds a logout URL even after the access token expired', async () => {
    const { auth } = fakeWorkOS({
      old: { authenticate: expired, refresh: refreshesTo('new') },
      new: { authenticate: active },
    });
    expect(await auth.logoutUrl('old')).toBe('https://auth.test/logout?seal=new');
    expect(await auth.logoutUrl('garbage')).toBeNull();
  });

  it('signs in with the code and returns the sealed session', async () => {
    const { auth } = fakeWorkOS({});
    expect(await auth.signIn('code')).toEqual({ user, sealedSession: 'seal-new' });
    expect(auth.authorizationUrl('s1')).toBe('https://auth.test/?state=s1');
  });
});
