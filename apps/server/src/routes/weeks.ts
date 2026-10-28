import {
  applyListOps,
  evaluateCandidateWeek,
  getShoppingList,
  getWeek,
  setWeekEntries,
} from '@simmery/domain';
import { z } from 'zod';
import { validate } from '../errors.js';
import { authedRouter, type RouteDeps } from './deps.js';

const weekParam = z.object({ weekKey: z.string() });

const entries = z.object({
  entries: z.array(
    z.object({
      id: z.string().optional(),
      recipeId: z.string(),
      servings: z.number(),
      day: z.number().nullish(),
    }),
  ),
});

const evaluation = z.object({
  entries: z.array(z.object({ recipeId: z.string(), servings: z.number() })),
});

const at = { at: z.iso.datetime({ offset: true }).transform((value) => new Date(value)) };

const listOps = z.object({
  ops: z.array(
    z.discriminatedUnion('type', [
      z.object({ ...at, type: z.literal('check'), ingredientId: z.string(), checked: z.boolean() }),
      z.object({ ...at, type: z.literal('addExtra'), id: z.string(), text: z.string() }),
      z.object({ ...at, type: z.literal('renameExtra'), id: z.string(), text: z.string() }),
      z.object({ ...at, type: z.literal('checkExtra'), id: z.string(), checked: z.boolean() }),
      z.object({ ...at, type: z.literal('removeExtra'), id: z.string() }),
    ]),
  ),
});

export function weekRoutes({ db, now }: RouteDeps) {
  return authedRouter()
    .post('/evaluate', validate('json', evaluation), async (c) =>
      c.json(await evaluateCandidateWeek(db, c.var.userId, c.req.valid('json').entries)),
    )
    .get('/:weekKey', validate('param', weekParam), async (c) =>
      c.json(await getWeek(db, c.var.userId, c.req.valid('param').weekKey, now())),
    )
    .put('/:weekKey/entries', validate('param', weekParam), validate('json', entries), async (c) =>
      c.json(
        await setWeekEntries(
          db,
          c.var.userId,
          c.req.valid('param').weekKey,
          c.req.valid('json').entries,
          now(),
        ),
      ),
    )
    .get('/:weekKey/shopping-list', validate('param', weekParam), async (c) =>
      c.json(await getShoppingList(db, c.var.userId, c.req.valid('param').weekKey, now())),
    )
    .post(
      '/:weekKey/shopping-list/ops',
      validate('param', weekParam),
      validate('json', listOps),
      async (c) =>
        c.json(
          await applyListOps(
            db,
            c.var.userId,
            c.req.valid('param').weekKey,
            c.req.valid('json').ops,
            now(),
          ),
        ),
    );
}
