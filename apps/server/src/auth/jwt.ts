import { OAuthError, OAuthErrorCode, type AuthInfo } from '@modelcontextprotocol/server';
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** The identity provider could not be asked; the token may still be good. */
export class AuthUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('identity provider unavailable', options);
    this.name = 'AuthUnavailableError';
  }
}

/**
 * What `/mcp` needs from the identity provider (KTD3). It carries no WorkOS
 * types, so tests sign tokens with their own key and never call WorkOS.
 */
export interface BearerAuth {
  /** The verified token, with the WorkOS user ID as `extra.userId`. */
  verifyAccessToken(token: string): Promise<AuthInfo>;
  /** AuthKit access tokens carry no email claim. */
  email(userId: string): Promise<string>;
}

/**
 * jose throws these when the key set could not be fetched or read: a plain
 * `JOSEError` for a non-200 or non-JSON answer, plus the timeout and an
 * unusable key set. Every other jose error is about the token itself.
 */
const UNAVAILABLE_CODES = new Set(['ERR_JOSE_GENERIC', 'ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID']);

export function userIdOf(authInfo: AuthInfo): string {
  return authInfo.extra?.userId as string;
}

export function authkitBearerAuth({
  issuer,
  resource,
  keys,
  users,
}: {
  /** The AuthKit domain. */
  issuer: string;
  /** The `/mcp` URL, registered in WorkOS as a Resource Indicator so tokens carry it as `aud`. */
  resource: string;
  /** `createRemoteJWKSet` over `${issuer}/oauth2/jwks` in production. */
  keys: JWTVerifyGetKey;
  users: { getUser(userId: string): Promise<{ email: string }> };
}): BearerAuth {
  return {
    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, keys, { issuer, audience: resource });
        if (!payload.sub) {
          throw new OAuthError(OAuthErrorCode.InvalidToken, 'token has no subject');
        }
        return {
          token,
          clientId: typeof payload.client_id === 'string' ? payload.client_id : '',
          scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
          expiresAt: payload.exp,
          // jose checked that `aud`, a string or an array, contains the resource.
          resource: new URL(resource),
          extra: { userId: payload.sub },
        };
      } catch (error) {
        if (error instanceof OAuthError) {
          throw error;
        }
        if (error instanceof errors.JOSEError && !UNAVAILABLE_CODES.has(error.code)) {
          throw new OAuthError(OAuthErrorCode.InvalidToken, 'invalid access token');
        }
        throw new AuthUnavailableError({ cause: error });
      }
    },
    async email(userId) {
      try {
        return (await users.getUser(userId)).email;
      } catch (error) {
        throw new AuthUnavailableError({ cause: error });
      }
    },
  };
}
