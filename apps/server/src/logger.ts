import type { Context, MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({ level });
}

/** Middleware is registered for `ALL`; the endpoint that answered is the last method route. */
function handlerRoute(c: Context): string {
  const endpoints = matchedRoutes(c).filter((route) => route.method !== 'ALL');
  return endpoints.at(-1)?.path ?? 'unmatched';
}

/** Logs the matched route pattern, never the raw path: `/api/share/:token` carries a secret. */
export function requestLogger(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    await next();
    logger.info(
      {
        method: c.req.method,
        route: handlerRoute(c),
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      'request',
    );
  };
}

/**
 * Drizzle's query errors embed the SQL parameters in their message (emails,
 * recipe and profile text), and pg errors repeat key values in `detail`, so
 * only the class, the SQLSTATE and the stack frames are logged (KTD12).
 */
export function safeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { type: typeof error };
  }
  const cause = error.cause as { code?: unknown } | undefined;
  const code = (error as { code?: unknown }).code ?? cause?.code;
  return {
    type: error.name,
    ...(typeof code === 'string' ? { code } : {}),
    stack: error.stack
      ?.split('\n')
      .filter((line) => line.trimStart().startsWith('at '))
      .join('\n'),
  };
}
