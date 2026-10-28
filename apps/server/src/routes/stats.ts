import { getStatistics } from '@simmery/domain';
import { authedRouter, type RouteDeps } from './deps.js';

export function statisticsRoutes({ db, now }: RouteDeps) {
  return authedRouter().get('/', async (c) => c.json(await getStatistics(db, c.var.userId, now())));
}
