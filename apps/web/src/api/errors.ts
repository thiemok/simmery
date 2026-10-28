/** The error bodies the server answers with (`apps/server/src/errors.ts` and the auth middleware). */
export type ApiErrorBody =
  | { error: 'validation'; issues: { field: string; message: string }[] }
  | { error: 'unresolved_units'; lines: { index: number; unit: string }[] }
  | { error: 'conflict'; reason: string }
  | { error: 'not_found'; entity?: string }
  | { error: 'no_longer_shared' }
  | { error: 'unauthenticated' | 'auth_unavailable' | 'forbidden_origin' | 'internal' };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(`API ${status}: ${body.error}`);
    this.name = 'ApiError';
  }
}

interface ApiResponse {
  ok: boolean;
  status: number;
}

async function failure(res: ApiResponse): Promise<ApiError> {
  const body = await (res as unknown as Response)
    .json()
    .catch((): ApiErrorBody => ({ error: 'internal' }));
  return new ApiError(res.status, body as ApiErrorBody);
}

/** Resolves to the JSON body of a successful response, or throws an `ApiError`. */
export async function ok<T>(request: Promise<ApiResponse & { json(): Promise<T> }>): Promise<T> {
  const res = await request;
  if (!res.ok) {
    throw await failure(res);
  }
  return res.json();
}

/** For responses without a body (204). */
export async function done(request: Promise<ApiResponse>): Promise<void> {
  const res = await request;
  if (!res.ok) {
    throw await failure(res);
  }
}

export const isApiError = (error: unknown, status?: number): error is ApiError =>
  error instanceof ApiError && (status === undefined || error.status === status);

/** Field messages of a 400, keyed by the server's field path (`lines[0].amount`). */
export function fieldIssues(error: unknown): Record<string, string> {
  if (!isApiError(error) || error.body.error !== 'validation') {
    return {};
  }
  return Object.fromEntries(error.body.issues.map((issue) => [issue.field, issue.message]));
}

export function conflictReason(error: unknown): string | null {
  return isApiError(error, 409) && error.body.error === 'conflict' ? error.body.reason : null;
}

export function unresolvedLines(error: unknown): { index: number; unit: string }[] {
  return isApiError(error, 422) && error.body.error === 'unresolved_units' ? error.body.lines : [];
}

const conflictMessages: Record<string, string> = {
  duplicate_name: 'An ingredient with this name already exists.',
  canonical_unit_in_use: 'Recipes use this ingredient, so its canonical unit can no longer change.',
  conversion_in_use: 'Recipe lines depend on this conversion, so it cannot be removed.',
  entry_cooked: 'This meal was already cooked, so it stays in the week.',
};

export const conflictMessage = (reason: string) =>
  conflictMessages[reason] ?? `The change conflicts with saved data (${reason}).`;

/** A short sentence for an error that has no field to attach to. */
export function errorMessage(error: unknown): string {
  if (!isApiError(error)) {
    return 'Something went wrong. Check your connection and try again.';
  }
  const { body } = error;
  switch (body.error) {
    case 'conflict':
      return conflictMessage(body.reason);
    case 'validation':
      return body.issues.map((issue) => issue.message).join(' ');
    case 'not_found':
      return 'Not found.';
    case 'auth_unavailable':
      return 'The sign-in service is unreachable. Try again in a moment.';
    default:
      return 'Something went wrong on the server. Try again.';
  }
}
