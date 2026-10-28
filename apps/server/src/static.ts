import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Paths the server owns; anything else is a client-side route of the SPA. */
const SERVER_PREFIXES = ['/api', '/auth', '/mcp', '/.well-known', '/healthz', '/readyz'];

const ownedByServer = (path: string) =>
  SERVER_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * Serves the built web app with an SPA fallback, so `/s/:token` and other
 * client routes get `index.html`. Vite's hashed `/assets/*` never change.
 */
export function webApp(root: string) {
  const files = serveStatic({ root });
  let indexHtml: Promise<string> | undefined;
  return new Hono()
    .use('/assets/*', async (c, next) => {
      await next();
      if (c.res.ok) {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
    })
    .use('*', async (c, next) => (ownedByServer(c.req.path) ? next() : files(c, next)))
    .get('*', async (c, next) => {
      if (ownedByServer(c.req.path)) {
        return next();
      }
      c.header('Cache-Control', 'no-cache');
      indexHtml ??= readFile(join(root, 'index.html'), 'utf8');
      return c.html(await indexHtml);
    });
}
