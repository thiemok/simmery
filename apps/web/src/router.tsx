import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { Shell } from './components/Shell';
import { ErrorState } from './components/states';
import { isoWeekKey } from './lib/week';
import { CatalogPage } from './routes/CatalogPage';
import { CookPage } from './routes/CookPage';
import { IngredientFormPage } from './routes/IngredientFormPage';
import { ProfilePage } from './routes/ProfilePage';
import { RecipeDetailPage } from './routes/RecipeDetailPage';
import { RecipeEditorPage } from './routes/RecipeEditorPage';
import { RecipesPage } from './routes/RecipesPage';
import { SharePage } from './routes/SharePage';
import { StatsPage } from './routes/StatsPage';
import { WeekPage } from './routes/WeekPage';

const rootRoute = createRootRoute({ component: Outlet });

const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 's/$token',
  component: function Share() {
    return <SharePage token={shareRoute.useParams().token} />;
  },
});

/** Everything behind sign-in. */
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: Shell });

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/week/$weekKey', params: { weekKey: isoWeekKey(new Date()) } });
  },
});

const weekRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'week/$weekKey',
  component: function Week() {
    return <WeekPage weekKey={weekRoute.useParams().weekKey} />;
  },
});

const cookRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'cook/$entryId',
  component: function Cook() {
    return <CookPage entryId={cookRoute.useParams().entryId} />;
  },
});

const recipesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'recipes',
  component: RecipesPage,
});

const newRecipeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'recipes/new',
  component: () => <RecipeEditorPage />,
});

const recipeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'recipes/$id',
  component: function Recipe() {
    const { id } = recipeRoute.useParams();
    return <RecipeDetailPage key={id} id={id} />;
  },
});

const editRecipeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'recipes/$id/edit',
  component: function EditRecipe() {
    const { id } = editRecipeRoute.useParams();
    return <RecipeEditorPage key={id} id={id} />;
  },
});

const catalogRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'catalog',
  component: CatalogPage,
});

const newIngredientRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'catalog/new',
  component: () => <IngredientFormPage />,
});

const ingredientRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'catalog/$id',
  component: function Ingredient() {
    const { id } = ingredientRoute.useParams();
    return <IngredientFormPage key={id} id={id} />;
  },
});

const statsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'stats',
  component: StatsPage,
});

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'profile',
  component: ProfilePage,
});

const routeTree = rootRoute.addChildren([
  shareRoute,
  appRoute.addChildren([
    homeRoute,
    weekRoute,
    cookRoute,
    recipesRoute,
    newRecipeRoute,
    recipeRoute,
    editRecipeRoute,
    catalogRoute,
    newIngredientRoute,
    ingredientRoute,
    statsRoute,
    profileRoute,
  ]),
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultErrorComponent: ({ error }) => (
      <div className="page">
        <ErrorState error={error} />
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="page">
        <h1 tabIndex={-1}>Page not found</h1>
      </div>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
