import {
  createIngredient,
  getIngredient,
  listIngredients,
  updateIngredient,
} from '@simmery/domain';
import { z } from 'zod';
import { validate } from '../errors.js';
import { authedRouter, type RouteDeps } from './deps.js';
import { idParam, ingredientInput } from './schemas.js';

export function ingredientRoutes({ db }: RouteDeps) {
  return authedRouter()
    .get('/', validate('query', z.object({ query: z.string().optional() })), async (c) =>
      c.json(await listIngredients(db, c.var.userId, c.req.valid('query'))),
    )
    .post('/', validate('json', ingredientInput), async (c) =>
      c.json(await createIngredient(db, c.var.userId, c.req.valid('json')), 201),
    )
    .get('/:id', validate('param', idParam), async (c) =>
      c.json(await getIngredient(db, c.var.userId, c.req.valid('param').id)),
    )
    .put('/:id', validate('param', idParam), validate('json', ingredientInput), async (c) =>
      c.json(
        await updateIngredient(db, c.var.userId, c.req.valid('param').id, c.req.valid('json')),
      ),
    );
}
