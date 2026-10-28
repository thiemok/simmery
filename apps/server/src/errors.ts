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
import type { ContentfulStatusCode } from 'hono/utils/http-status';
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

/**
 * The status and body a domain error answers with, shared by the API and the
 * MCP tools so an agent sees what the web app sees (KTD2). Undefined for any
 * other error.
 */
export function domainErrorBody(
  error: unknown,
): { status: ContentfulStatusCode; body: Record<string, unknown> } | undefined {
  if (error instanceof ValidationError) {
    return { status: 400, body: { error: 'validation', issues: error.issues } };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: 'not_found', entity: error.entity } };
  }
  if (error instanceof ConflictError) {
    return { status: 409, body: { error: 'conflict', reason: error.reason } };
  }
  if (error instanceof UnresolvedUnitsError) {
    return { status: 422, body: { error: 'unresolved_units', lines: error.lines } };
  }
  if (error instanceof NoLongerSharedError) {
    return { status: 410, body: { error: 'no_longer_shared' } };
  }
  return undefined;
}

export function errorHandler(logger: Logger): ErrorHandler {
  return (error, c) => {
    const domain = domainErrorBody(error);
    if (domain) {
      return c.json(domain.body, domain.status);
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
