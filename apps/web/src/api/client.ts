import type { ApiType } from '@simmery/server';
import { hc } from 'hono/client';
import { createContext, useContext } from 'react';

export const createApiClient = (
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  baseUrl = '/api',
) => hc<ApiType>(baseUrl, { fetch: fetchImpl });

export type ApiClient = ReturnType<typeof createApiClient>;

export const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) {
    throw new Error('useApi needs an ApiContext provider');
  }
  return api;
}
