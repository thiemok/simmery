import type { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createApiClient } from '../api/client';
import { createQueryClient } from '../api/queries';
import { App } from '../App';
import { createAppRouter } from '../router';

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface Reply {
  status?: number;
  body?: unknown;
}

/** A function of the request, or a fixed reply. */
type Handler = ((call: Call) => unknown) | object;

/**
 * A stand-in for the server's `/api`, keyed by `METHOD /path` (without `/api` and the
 * query string). A handler returns `{ status, body }`, or a bare value for a 200.
 * Unknown requests answer 404 so a missing handler shows up as a failing test.
 */
export function fakeApi(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://simmery.test');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/api/, '');
    const call: Call = {
      method,
      path,
      query: url.searchParams,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const key = `${method} ${path}`;
    const handler = handlers[key];
    const result = !(key in handlers)
      ? { status: 404, body: { error: 'not_found' } }
      : typeof handler === 'function'
        ? await handler(call)
        : handler;
    const reply: Reply =
      result && typeof result === 'object' && ('status' in result || 'body' in result)
        ? (result as Reply)
        : { body: result };
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? null), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: fetchImpl as typeof fetch, calls };
}

export const me = { id: 'user_a', email: 'a@example.com' };

export interface RenderedApp {
  user: UserEvent;
  queryClient: QueryClient;
  router: ReturnType<typeof createAppRouter>;
  calls: Call[];
  /** What a 401 calls; in the browser it navigates to sign-in. */
  onUnauthenticated: () => void;
}

/** Renders the whole app at `path` over a fake API, signed in unless `/me` is overridden. */
export async function renderApp(
  path: string,
  handlers: Record<string, Handler>,
): Promise<RenderedApp> {
  const api = fakeApi({ 'GET /me': () => me, ...handlers });
  const onUnauthenticated = vi.fn();
  const queryClient = createQueryClient(onUnauthenticated);
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  const user = userEvent.setup();
  render(
    <App
      api={createApiClient(api.fetch, 'http://simmery.test/api')}
      queryClient={queryClient}
      router={router}
    />,
  );
  await router.load();
  return { user, queryClient, router, calls: api.calls, onUnauthenticated };
}

export const callsTo = (calls: Call[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

export function ingredient(
  overrides: Partial<{
    id: string;
    name: string;
    aliases: string[];
    canonicalUnit: string;
    packSizes: number[];
    conversions: { unit: string; factor: number }[];
  }> = {},
) {
  return {
    id: overrides.id ?? `ing-${overrides.name ?? 'x'}`,
    name: 'garlic',
    aliases: [],
    canonicalUnit: 'clove',
    packSizes: [],
    conversions: [],
    ...overrides,
  };
}
