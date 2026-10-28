import { serve } from '@hono/node-server';
import { createTestApp } from '@simmery/server/testing';
import { fileURLToPath } from 'node:url';

/**
 * The real app over PGlite and the fake session (KTD15): a test signs in by
 * setting the session cookie to `active|<id>|<email>`. Never used by `main.ts`.
 */
const port = Number(process.env.E2E_PORT ?? 4310);
const { app } = await createTestApp({
  publicBaseUrl: `http://localhost:${port}`,
  webRoot: fileURLToPath(new URL('../dist', import.meta.url)),
});

serve({ fetch: app.fetch, port }, () => console.log(`e2e server on http://localhost:${port}`));
