import { deleteCookEvent, getCookView, markCooked, rateCookEvent } from '@simmery/domain';
import { z } from 'zod';
import { validate } from '../errors.js';
import { authedRouter, type RouteDeps } from './deps.js';
import { idParam } from './schemas.js';

const rating = z.object({ rating: z.number().nullable() });

export function planEntryRoutes({ db, now }: RouteDeps) {
  return authedRouter()
    .get('/:id/cook-view', validate('param', idParam), async (c) =>
      c.json(await getCookView(db, c.var.userId, c.req.valid('param').id)),
    )
    .post(
      '/:id/cook-events',
      validate('param', idParam),
      validate('json', rating.partial()),
      async (c) =>
        c.json(
          await markCooked(db, c.var.userId, c.req.valid('param').id, c.req.valid('json'), now()),
          201,
        ),
    );
}

export function cookEventRoutes({ db }: RouteDeps) {
  return authedRouter()
    .put('/:id/rating', validate('param', idParam), validate('json', rating), async (c) =>
      c.json(
        await rateCookEvent(db, c.var.userId, c.req.valid('param').id, c.req.valid('json').rating),
      ),
    )
    .delete('/:id', validate('param', idParam), async (c) => {
      await deleteCookEvent(db, c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    });
}
