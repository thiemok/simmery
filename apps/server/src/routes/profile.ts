import { getTasteProfile, updateTasteProfile } from '@simmery/domain';
import { z } from 'zod';
import { validate } from '../errors.js';
import { authedRouter, type RouteDeps } from './deps.js';

export function tasteProfileRoutes({ db }: RouteDeps) {
  return authedRouter()
    .get('/', async (c) => c.json(await getTasteProfile(db, c.var.userId)))
    .put('/', validate('json', z.object({ body: z.string() })), async (c) =>
      c.json(await updateTasteProfile(db, c.var.userId, c.req.valid('json').body)),
    );
}
