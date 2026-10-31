import { OAuthError } from '@modelcontextprotocol/server';
import { errors, type JWTVerifyGetKey } from 'jose';
import { describe, expect, it } from 'vitest';
import { AUTHKIT_DOMAIN, MCP_URL, createSigningKey, userA } from '../testing.js';
import { AuthUnavailableError, authkitBearerAuth, userIdOf } from './jwt.js';

function bearerWith(keys: JWTVerifyGetKey, getUser = async () => userA) {
  return authkitBearerAuth({ issuer: AUTHKIT_DOMAIN, resource: MCP_URL, keys, users: { getUser } });
}

describe('authkitBearerAuth', () => {
  it('returns the WorkOS user, client and resource of a valid token', async () => {
    const { keys, tokenFor } = await createSigningKey();
    const info = await bearerWith(keys).verifyAccessToken(
      await tokenFor(userA, { aud: [MCP_URL, 'client_test'], scope: 'openid email' }),
    );
    expect(userIdOf(info)).toBe(userA.id);
    expect(info).toMatchObject({
      clientId: 'client_test',
      scopes: ['openid', 'email'],
      resource: new URL(MCP_URL),
    });
    expect(info.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('treats a key set that cannot be fetched or read as unavailable', async () => {
    const { tokenFor } = await createSigningKey();
    const token = await tokenFor(userA);
    for (const failure of [
      new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'),
      new errors.JWKSTimeout(),
      new errors.JWKSInvalid(),
      new TypeError('fetch failed'),
    ]) {
      const keys: JWTVerifyGetKey = async () => {
        throw failure;
      };
      await expect(bearerWith(keys).verifyAccessToken(token)).rejects.toBeInstanceOf(
        AuthUnavailableError,
      );
    }
  });

  it('treats an unknown key ID and a token without a subject as invalid', async () => {
    const { keys, tokenFor } = await createSigningKey();
    const other = await createSigningKey();
    for (const token of [await other.tokenFor(userA), await tokenFor(userA, { sub: undefined })]) {
      await expect(bearerWith(keys).verifyAccessToken(token)).rejects.toBeInstanceOf(OAuthError);
    }
  });

  it('reads the email from WorkOS and reports a failed lookup as unavailable', async () => {
    const { keys } = await createSigningKey();
    expect(await bearerWith(keys).email(userA.id)).toBe(userA.email);
    const failing = bearerWith(keys, async () => {
      throw new Error('WorkOS 500');
    });
    await expect(failing.email(userA.id)).rejects.toBeInstanceOf(AuthUnavailableError);
  });
});
