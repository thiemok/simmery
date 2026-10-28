import {
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { InferRequestType, InferResponseType } from 'hono/client';
import { useApi, type ApiClient } from './client';
import { done, isApiError, ok } from './errors';

type RecipeRoute = ApiClient['recipes'][':id'];
type IngredientRoute = ApiClient['ingredients'][':id'];

export type Me = InferResponseType<ApiClient['me']['$get'], 200>;
export type Recipe = InferResponseType<RecipeRoute['$get'], 200>;
export type RecipeLine = Recipe['lines'][number];
export type RecipeSummary = InferResponseType<ApiClient['recipes']['$get'], 200>[number];
export type RecipeInput = InferRequestType<ApiClient['recipes']['$post']>['json'];
export type RecipeLineInput = RecipeInput['lines'][number];
export type Ingredient = InferResponseType<IngredientRoute['$get'], 200>;
export type IngredientInput = InferRequestType<ApiClient['ingredients']['$post']>['json'];
export type Week = InferResponseType<ApiClient['weeks'][':weekKey']['$get'], 200>;
export type WeekEntry = Week['entries'][number];
export type WeekEntryInput = InferRequestType<
  ApiClient['weeks'][':weekKey']['entries']['$put']
>['json']['entries'][number];
export type WeekIngredientLine = Week['evaluation']['lines'][number];
export type CookView = InferResponseType<
  ApiClient['plan-entries'][':id']['cook-view']['$get'],
  200
>;
export type CookEvent = CookView['cookEvents'][number];
export type Statistics = InferResponseType<ApiClient['statistics']['$get'], 200>;
export type TasteProfile = InferResponseType<ApiClient['taste-profile']['$get'], 200>;
export type ShareLink = InferResponseType<RecipeRoute['share-links']['$get'], 200>[number];
export type SharedRecipe = InferResponseType<ApiClient['share'][':token']['$get'], 200>;
export type ImportLineMapping = InferRequestType<
  ApiClient['share'][':token']['import']['$post']
>['json']['lines'][number];

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { signedOutOk?: boolean };
    mutationMeta: { signedOutOk?: boolean };
  }
}

/** The shared query client; a 401 anywhere except where `signedOutOk` is set signs the user in again. */
export function createQueryClient(onUnauthenticated: () => void) {
  const handle = (error: unknown, meta?: { signedOutOk?: boolean }) => {
    if (isApiError(error, 401) && !meta?.signedOutOk) {
      onUnauthenticated();
    }
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => handle(error, query.meta) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => handle(error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

export const keys = {
  me: ['me'] as const,
  recipes: ['recipes'] as const,
  recipe: (id: string, servings?: number) => ['recipes', id, servings ?? null] as const,
  ingredients: ['ingredients'] as const,
  ingredientSearch: (query: string) => ['ingredients', 'search', query] as const,
  ingredient: (id: string) => ['ingredients', id] as const,
  week: (weekKey: string) => ['weeks', weekKey] as const,
  cookView: (entryId: string) => ['cook-view', entryId] as const,
  statistics: ['statistics'] as const,
  tasteProfile: ['taste-profile'] as const,
  shareLinks: (recipeId: string) => ['share-links', recipeId] as const,
  shared: (token: string) => ['shared', token] as const,
};

export function useMe({ signedOutOk = false } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: keys.me,
    queryFn: () => ok(api.me.$get()),
    meta: { signedOutOk },
    retry: false,
  });
}

export function useRecipes(params: { query?: string; tag?: string; archived?: boolean }) {
  const api = useApi();
  const query = {
    ...(params.query ? { query: params.query } : {}),
    ...(params.tag ? { tag: params.tag } : {}),
    ...(params.archived ? { archived: 'true' as const } : {}),
  };
  return useQuery({
    queryKey: [...keys.recipes, 'list', query],
    queryFn: () => ok(api.recipes.$get({ query })),
  });
}

export function useRecipe(id: string, servings?: number, { enabled = true } = {}) {
  const api = useApi();
  return useQuery({
    enabled,
    queryKey: keys.recipe(id, servings),
    queryFn: () =>
      ok(
        api.recipes[':id'].$get({
          param: { id },
          query: servings === undefined ? {} : { servings: String(servings) },
        }),
      ),
  });
}

export function useSaveRecipe(id?: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (json: RecipeInput) =>
      id ? ok(api.recipes[':id'].$put({ param: { id }, json })) : ok(api.recipes.$post({ json })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.recipes }),
  });
}

export function useArchiveRecipe() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => done(api.recipes[':id'].$delete({ param: { id } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.recipes }),
  });
}

export function useRestoreRecipe() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => done(api.recipes[':id'].restore.$post({ param: { id } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.recipes }),
  });
}

export function useIngredients(query = '') {
  const api = useApi();
  return useQuery({
    queryKey: keys.ingredientSearch(query),
    queryFn: () => ok(api.ingredients.$get({ query: query ? { query } : {} })),
  });
}

export function useIngredient(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.ingredient(id),
    queryFn: () => ok(api.ingredients[':id'].$get({ param: { id } })),
  });
}

/** Creates (no `id`) or replaces an ingredient and puts the result in the cache. */
export function useSaveIngredient() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, json }: { id?: string; json: IngredientInput }) =>
      id
        ? ok(api.ingredients[':id'].$put({ param: { id }, json }))
        : ok(api.ingredients.$post({ json })),
    onSuccess: (ingredient) => {
      client.setQueryData(keys.ingredient(ingredient.id), ingredient);
      return client.invalidateQueries({ queryKey: keys.ingredients });
    },
  });
}

export function useWeek(weekKey: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.week(weekKey),
    queryFn: () => ok(api.weeks[':weekKey'].$get({ param: { weekKey } })),
  });
}

/**
 * Saves a week's entries. Saves for one week run one after another (the mutation
 * scope), and `build` runs only when a save starts, so it reads the latest saved
 * week: an entry the previous save created then carries its ID instead of being
 * inserted twice.
 */
export function useSetWeekEntries(weekKey: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    scope: { id: `week:${weekKey}` },
    mutationFn: (build: (saved: Week | undefined) => WeekEntryInput[]) =>
      ok(
        api.weeks[':weekKey'].entries.$put({
          param: { weekKey },
          json: { entries: build(client.getQueryData<Week>(keys.week(weekKey))) },
        }),
      ),
    onSuccess: (week) => {
      client.setQueryData(keys.week(weekKey), week);
      return client.invalidateQueries({ queryKey: keys.statistics });
    },
  });
}

export function useCookView(entryId: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.cookView(entryId),
    queryFn: () => ok(api['plan-entries'][':id']['cook-view'].$get({ param: { id: entryId } })),
  });
}

function useCookingMutation<T>(entryId: string, mutationFn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.cookView(entryId) }),
        client.invalidateQueries({ queryKey: keys.statistics }),
      ]),
  });
}

export function useMarkCooked(entryId: string) {
  const api = useApi();
  return useCookingMutation(entryId, (rating: number | null) =>
    ok(
      api['plan-entries'][':id']['cook-events'].$post({ param: { id: entryId }, json: { rating } }),
    ),
  );
}

export function useRateCookEvent(entryId: string) {
  const api = useApi();
  return useCookingMutation(entryId, ({ id, rating }: { id: string; rating: number | null }) =>
    ok(api['cook-events'][':id'].rating.$put({ param: { id }, json: { rating } })),
  );
}

export function useDeleteCookEvent(entryId: string) {
  const api = useApi();
  return useCookingMutation(entryId, (id: string) =>
    done(api['cook-events'][':id'].$delete({ param: { id } })),
  );
}

export function useStatistics() {
  const api = useApi();
  return useQuery({ queryKey: keys.statistics, queryFn: () => ok(api.statistics.$get()) });
}

export function useTasteProfile() {
  const api = useApi();
  return useQuery({
    queryKey: keys.tasteProfile,
    queryFn: () => ok(api['taste-profile'].$get()),
  });
}

export function useUpdateTasteProfile() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => ok(api['taste-profile'].$put({ json: { body } })),
    onSuccess: (profile) => client.setQueryData(keys.tasteProfile, profile),
  });
}

export function useShareLinks(recipeId: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.shareLinks(recipeId),
    queryFn: () => ok(api.recipes[':id']['share-links'].$get({ param: { id: recipeId } })),
  });
}

export function useCreateShareLink(recipeId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => ok(api.recipes[':id']['share-links'].$post({ param: { id: recipeId } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.shareLinks(recipeId) }),
  });
}

export function useRevokeShareLink(recipeId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      done(api['share-links'][':id'].$delete({ param: { id: linkId } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.shareLinks(recipeId) }),
  });
}

export function useSharedRecipe(token: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.shared(token),
    queryFn: () => ok(api.share[':token'].$get({ param: { token } })),
    meta: { signedOutOk: true },
  });
}

export function useImportShared(token: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (lines: ImportLineMapping[]) =>
      ok(api.share[':token'].import.$post({ param: { token }, json: { lines } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.recipes }),
  });
}
