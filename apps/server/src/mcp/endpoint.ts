import { hostHeaderValidation } from '@modelcontextprotocol/hono';
import {
  OAuthError,
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  verifyBearerToken,
  type AuthInfo,
} from '@modelcontextprotocol/server';
import type { Database } from '@simmery/db';
import { ensureUser, getUser } from '@simmery/domain';
import { Hono } from 'hono';
import { AuthUnavailableError, userIdOf, type BearerAuth } from '../auth/jwt.js';
import { safeError, type Logger } from '../logger.js';
import { createMcpServer } from './server.js';

/**
 * `/mcp`: the Host check, the bearer gate, local provisioning, then a fresh
 * MCP server bound to the token's user for every request (KTD10).
 */
export function mcpEndpoint({
  db,
  now,
  logger,
  bearer,
  resource,
}: {
  db: Database;
  now: () => Date;
  logger: Logger;
  bearer: BearerAuth;
  /** See `mcpResource`. */
  resource: string;
}) {
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(resource));
  const handler = createMcpHandler(
    ({ authInfo }) => createMcpServer({ db, now, logger, userId: userIdOf(authInfo!) }),
    { onerror: (error) => logger.warn({ err: safeError(error) }, 'mcp request failed') },
  );

  return (
    new Hono()
      // DNS-rebinding defence; the adapter's default allows only localhost.
      .use('*', hostHeaderValidation([new URL(resource).hostname]))
      .all('/', async (c) => {
        let authInfo: AuthInfo;
        let newUserEmail: string | undefined;
        try {
          authInfo = await verifyBearerToken(c.req.header('authorization'), {
            verifier: bearer,
            expectedResource: new URL(resource),
            resourceMetadataUrl,
          });
          if (!(await getUser(db, userIdOf(authInfo)))) {
            newUserEmail = await bearer.email(userIdOf(authInfo));
          }
        } catch (error) {
          if (error instanceof AuthUnavailableError) {
            logger.warn({ err: safeError(error.cause) }, 'identity provider unavailable');
            return c.json({ error: 'auth_unavailable' }, 503);
          }
          if (error instanceof OAuthError) {
            return bearerAuthChallengeResponse(error, { resourceMetadataUrl });
          }
          throw error;
        }
        if (newUserEmail !== undefined) {
          await ensureUser(db, { id: userIdOf(authInfo), email: newUserEmail });
        }
        return handler.fetch(c.req.raw, { authInfo });
      })
  );
}

export const mcpResource = (publicBaseUrl: string) => `${publicBaseUrl}/mcp`;
