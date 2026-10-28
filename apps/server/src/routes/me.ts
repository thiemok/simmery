import { users } from '@simmery/db';
import { eq } from 'drizzle-orm';
import { authedRouter, type RouteDeps } from './deps.js';

/** The web app's session probe. */
export function meRoutes({ db }: RouteDeps) {
  return authedRouter().get('/', async (c) => {
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, c.var.userId));
    return c.json(user);
  });
}
