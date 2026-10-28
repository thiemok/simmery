import { serve } from '@hono/node-server';
import { createDatabase, migrate } from '@simmery/db';
import { WorkOS } from '@workos-inc/node';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { workosSessionAuth } from './auth/workos.js';
import { loadConfig } from './config.js';
import { createLogger, safeError } from './logger.js';

const config = loadConfig(process.env);
const logger = createLogger(config.LOG_LEVEL);

const pool = new Pool({ connectionString: config.DATABASE_URL });
await migrate(pool);

// Session `authenticate()` and `refresh()` read the client ID from the instance.
const workos = new WorkOS(config.WORKOS_API_KEY, { clientId: config.WORKOS_CLIENT_ID });

const app = createApp({
  db: createDatabase(pool),
  auth: workosSessionAuth(workos.userManagement, {
    clientId: config.WORKOS_CLIENT_ID,
    cookiePassword: config.WORKOS_COOKIE_PASSWORD,
    redirectUri: `${config.PUBLIC_BASE_URL}/auth/callback`,
  }),
  logger,
  publicBaseUrl: config.PUBLIC_BASE_URL,
  checkDatabase: async () => {
    await Promise.race([
      pool.query('select 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2_000).unref()),
    ]);
  },
  webRoot: config.WEB_ROOT,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, ({ port }) =>
  logger.info({ port }, 'listening'),
);

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    pool.end().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error({ err: safeError(error) }, 'pool shutdown failed');
        process.exit(1);
      },
    );
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
