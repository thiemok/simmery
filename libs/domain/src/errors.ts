/** A missing row, or one owned by another user: both look the same to the caller (KTD4). */
export class NotFoundError extends Error {
  constructor(
    readonly entity: 'ingredient' | 'recipe',
    readonly id: string,
  ) {
    super(`${entity} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export interface FieldIssue {
  /** Path into the input, e.g. `conversions[0].factor`. */
  field: string;
  message: string;
}

export class ValidationError extends Error {
  constructor(readonly issues: readonly FieldIssue[]) {
    super(issues.map((issue) => `${issue.field}: ${issue.message}`).join('; '));
    this.name = 'ValidationError';
  }
}

export type ConflictReason = 'duplicate_name' | 'canonical_unit_in_use' | 'conversion_in_use';

export class ConflictError extends Error {
  constructor(
    readonly reason: ConflictReason,
    message: string,
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}

export function throwIfIssues(issues: readonly FieldIssue[]): void {
  if (issues.length > 0) {
    throw new ValidationError(issues);
  }
}

/** Drizzle wraps driver errors; the Postgres error with its constraint name is the `cause`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } } | undefined)?.cause;
  return cause?.code === '23505' && cause.constraint === constraint;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres rejects malformed UUIDs with a syntax error, so callers check before querying. */
export function isUuid(id: string): boolean {
  return uuidPattern.test(id);
}
