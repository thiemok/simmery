import { hostHeaderValidation } from '@modelcontextprotocol/hono';
import {
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  verifyBearerToken,
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
  /** `${PUBLIC_BASE_URL}/mcp`. */
  resource: string;
}) {
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(resource));
  const handler = createMcpHandler(
    ({ authInfo }) => createMcpServer({ db, now, logger, userId: userIdOf(authInfo!) }),
    { onerror: (error) => logger.warn({ err: safeError(error) }, 'mcp request failed') },
  );

  /** Runs a call to the identity provider; its failures answer the client directly. */
  async function ask<T>(call: () => Promise<T>): Promise<T | Response> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof AuthUnavailableError) {
        logger.warn({ err: safeError(error.cause) }, 'identity provider unavailable');
        return Response.json({ error: 'auth_unavailable' }, { status: 503 });
      }
      return bearerAuthChallengeResponse(error, { resourceMetadataUrl });
    }
  }

  return (
    new Hono()
      // DNS-rebinding defence; the adapter's default allows only localhost.
      .use('*', hostHeaderValidation([new URL(resource).hostname]))
      .all('/', async (c) => {
        const authInfo = await ask(() =>
          verifyBearerToken(c.req.header('authorization'), {
            verifier: bearer,
            expectedResource: new URL(resource),
            resourceMetadataUrl,
          }),
        );
        if (authInfo instanceof Response) {
          return authInfo;
        }
        const userId = userIdOf(authInfo);
        if (!(await getUser(db, userId))) {
          const email = await ask(() => bearer.email(userId));
          if (email instanceof Response) {
            return email;
          }
          await ensureUser(db, { id: userId, email });
        }
        return handler.fetch(c.req.raw, { authInfo });
      })
  );
}
