import { zValidator } from '@hono/zod-validator';
import {
  ConflictError,
  NoLongerSharedError,
  NotFoundError,
  UnresolvedUnitsError,
  ValidationError,
  type FieldIssue,
} from '@simmery/domain';
import type { ErrorHandler, ValidationTargets } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';
import { safeError, type Logger } from './logger.js';

/** Renders a zod path the way the domain names fields: `lines[0].amount`. */
function fieldPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, index) =>
      typeof key === 'number' ? `[${key}]` : `${index === 0 ? '' : '.'}${String(key)}`,
    )
    .join('');
}

/**
 * Validates shape only (types, presence); semantic rules stay in the domain so
 * web and MCP agree (KTD2). Failures throw into `onError`, so every route
 * answers with the same 400 body as a domain `ValidationError`.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new ValidationError(
        result.error.issues.map((issue): FieldIssue => ({
          field: fieldPath(issue.path),
          message: issue.message,
        })),
      );
    }
  });
}

export function errorHandler(logger: Logger): ErrorHandler {
  return (error, c) => {
    if (error instanceof ValidationError) {
      return c.json({ error: 'validation', issues: error.issues }, 400);
    }
    if (error instanceof NotFoundError) {
      return c.json({ error: 'not_found', entity: error.entity }, 404);
    }
    if (error instanceof ConflictError) {
      return c.json({ error: 'conflict', reason: error.reason }, 409);
    }
    if (error instanceof UnresolvedUnitsError) {
      return c.json({ error: 'unresolved_units', lines: error.lines }, 422);
    }
    if (error instanceof NoLongerSharedError) {
      return c.json({ error: 'no_longer_shared' }, 410);
    }
    if (error instanceof HTTPException) {
      if (error.status === 400) {
        return c.json(
          { error: 'validation', issues: [{ field: '', message: error.message }] },
          400,
        );
      }
      return error.getResponse();
    }
    logger.error({ err: safeError(error) }, 'unhandled error');
    return c.json({ error: 'internal' }, 500);
  };
}
