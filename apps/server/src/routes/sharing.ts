import { importSharedRecipe, resolveShareToken, revokeShareLink } from '@simmery/domain';
import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/middleware.js';
import { validate } from '../errors.js';
import { authedRouter, type RouteDeps } from './deps.js';
import { idParam, importInput } from './schemas.js';

const tokenParam = z.object({ token: z.string() });

export function shareLinkRoutes({ db }: RouteDeps) {
  return authedRouter().delete('/:id', validate('param', idParam), async (c) => {
    await revokeShareLink(db, c.var.userId, c.req.valid('param').id);
    return c.body(null, 204);
  });
}

/** Reading a shared recipe needs no session (R23); importing it does (R24). */
export function sharedRecipeRoutes({ db }: RouteDeps, requireSession: MiddlewareHandler<AuthEnv>) {
  return authedRouter()
    .get('/:token', validate('param', tokenParam), async (c) =>
      c.json(await resolveShareToken(db, c.req.valid('param').token)),
    )
    .post(
      '/:token/import',
      requireSession,
      validate('param', tokenParam),
      validate('json', importInput),
      async (c) =>
        c.json(
          await importSharedRecipe(
            db,
            c.var.userId,
            c.req.valid('param').token,
            c.req.valid('json'),
          ),
          201,
        ),
    );
}
