import { getUser } from '@simmery/domain';
import { authedRouter, type RouteDeps } from './deps.js';

/** The web app's session probe. */
export function meRoutes({ db }: RouteDeps) {
  return authedRouter().get('/', async (c) => c.json(await getUser(db, c.var.userId)));
}
