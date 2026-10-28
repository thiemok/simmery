import type { Database } from '@simmery/db';
import { Hono } from 'hono';
import type { AuthEnv } from './auth/middleware.js';
import { requireSession, sameOrigin } from './auth/middleware.js';
import { authRoutes } from './auth/routes.js';
import type { SessionAuth } from './auth/session.js';
import { errorHandler } from './errors.js';
import { requestLogger, type Logger } from './logger.js';
import { cookEventRoutes, planEntryRoutes } from './routes/cooking.js';
import { ingredientRoutes } from './routes/ingredients.js';
import { meRoutes } from './routes/me.js';
import { tasteProfileRoutes } from './routes/profile.js';
import { recipeRoutes } from './routes/recipes.js';
import { shareLinkRoutes, sharedRecipeRoutes } from './routes/sharing.js';
import { statisticsRoutes } from './routes/stats.js';
import { weekRoutes } from './routes/weeks.js';
import { webApp } from './static.js';

export interface AppDeps {
  db: Database;
  auth: SessionAuth;
  logger: Logger;
  /** Absolute origin the app is served from, without a trailing slash. */
  publicBaseUrl: string;
  /** Rejects when the database cannot answer; `/readyz` reports it. */
  checkDatabase: () => Promise<void>;
  now?: () => Date;
  /** The built web app; without it only the server's own paths answer. */
  webRoot?: string;
}

function createApi(deps: Required<Pick<AppDeps, 'db' | 'auth' | 'now'>>, secure: boolean) {
  const routeDeps = { db: deps.db, now: deps.now };
  const session = requireSession(deps.db, deps.auth, { secure });
  return new Hono<AuthEnv>()
    .route('/share', sharedRecipeRoutes(routeDeps, session))
    .use('*', session)
    .route('/me', meRoutes(routeDeps))
    .route('/ingredients', ingredientRoutes(routeDeps))
    .route('/recipes', recipeRoutes(routeDeps))
    .route('/share-links', shareLinkRoutes(routeDeps))
    .route('/weeks', weekRoutes(routeDeps))
    .route('/plan-entries', planEntryRoutes(routeDeps))
    .route('/cook-events', cookEventRoutes(routeDeps))
    .route('/statistics', statisticsRoutes(routeDeps))
    .route('/taste-profile', tasteProfileRoutes(routeDeps));
}

/** The JSON API's type, for the Hono RPC client in the web app (KTD9). */
export type ApiType = ReturnType<typeof createApi>;

export function createApp({
  db,
  auth,
  logger,
  publicBaseUrl,
  checkDatabase,
  now = () => new Date(),
  webRoot,
}: AppDeps) {
  const secure = !publicBaseUrl.startsWith('http://localhost');
  const cookies = { secure };
  const app = new Hono();
  app.onError(errorHandler(logger));
  app.use('*', requestLogger(logger));

  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    try {
      await checkDatabase();
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    }
  });

  const origin = new URL(publicBaseUrl).origin;
  app.use('/auth/logout', sameOrigin(origin));
  app.route('/auth', authRoutes({ db, auth, cookies, publicBaseUrl }));

  app.use('/api/*', sameOrigin(origin));
  app.route('/api', createApi({ db, auth, now }, secure));
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  if (webRoot) {
    app.route('/', webApp(webRoot));
  }
  return app;
}
