import {
  createRecipe,
  createShareLink,
  deleteRecipe,
  getRecipe,
  listShareLinks,
  restoreRecipe,
  scaleRecipe,
  searchRecipes,
  updateRecipe,
} from '@simmery/domain';
import { z } from 'zod';
import { validate } from '../errors.js';
import { authedRouter, type RouteDeps } from './deps.js';
import { idParam, positiveIntQuery, queryBoolean, recipeInput } from './schemas.js';

const searchQuery = z.object({
  query: z.string().optional(),
  tag: z.string().optional(),
  archived: queryBoolean.optional(),
});

export function recipeRoutes({ db }: RouteDeps) {
  return authedRouter()
    .get('/', validate('query', searchQuery), async (c) =>
      c.json(await searchRecipes(db, c.var.userId, c.req.valid('query'))),
    )
    .post('/', validate('json', recipeInput), async (c) =>
      c.json(await createRecipe(db, c.var.userId, c.req.valid('json')), 201),
    )
    .get(
      '/:id',
      validate('param', idParam),
      validate('query', z.object({ servings: positiveIntQuery.optional() })),
      async (c) => {
        const recipe = await getRecipe(db, c.var.userId, c.req.valid('param').id);
        const { servings } = c.req.valid('query');
        return c.json(servings === undefined ? recipe : scaleRecipe(recipe, servings));
      },
    )
    .put('/:id', validate('param', idParam), validate('json', recipeInput), async (c) =>
      c.json(await updateRecipe(db, c.var.userId, c.req.valid('param').id, c.req.valid('json'))),
    )
    .delete('/:id', validate('param', idParam), async (c) => {
      await deleteRecipe(db, c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .post('/:id/restore', validate('param', idParam), async (c) => {
      await restoreRecipe(db, c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .get('/:id/share-links', validate('param', idParam), async (c) =>
      c.json(await listShareLinks(db, c.var.userId, c.req.valid('param').id)),
    )
    .post('/:id/share-links', validate('param', idParam), async (c) =>
      c.json(await createShareLink(db, c.var.userId, c.req.valid('param').id), 201),
    );
}
