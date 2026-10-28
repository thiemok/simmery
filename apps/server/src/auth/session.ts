import type { UserIdentity } from '@simmery/domain';

export type ResumeResult =
  | { status: 'active'; user: UserIdentity }
  /** The access token had expired; the caller must store the new seal. */
  | { status: 'refreshed'; user: UserIdentity; sealedSession: string }
  | { status: 'signed_out' }
  /** The identity provider could not be reached; the session may still be good. */
  | { status: 'unavailable' };

/**
 * What the app needs from the identity provider for website sessions. It
 * carries no WorkOS types, so tests inject a fake and never call WorkOS.
 */
export interface SessionAuth {
  authorizationUrl(state: string): string;
  signIn(code: string): Promise<{ user: UserIdentity; sealedSession: string }>;
  resume(sealedSession: string): Promise<ResumeResult>;
  /** Null when the session cannot be read, so there is no provider session to end. */
  logoutUrl(sealedSession: string): Promise<string | null>;
}
