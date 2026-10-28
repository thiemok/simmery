import type { McpServer } from '@modelcontextprotocol/server';
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  scaleRecipe,
  searchRecipes,
  updateRecipe,
} from '@simmery/domain';
import { z } from 'zod';
import { recipeInput } from '../../routes/schemas.js';
import { defineTool, readOnly, type ToolContext } from '../result.js';

export function registerRecipeTools(server: McpServer, ctx: ToolContext) {
  const { db, userId } = ctx;

  defineTool(
    server,
    ctx,
    'search_recipes',
    {
      description:
        "Lists the user's recipes (id, title, servings), filtered by part of the title and by tag. Archived recipes are listed only, and exclusively, with `archived: true`.",
      inputSchema: z.object({
        query: z.string().optional(),
        tag: z.string().optional(),
        archived: z.boolean().optional(),
      }),
      annotations: readOnly,
    },
    (input) => searchRecipes(db, userId, input),
  );

  defineTool(
    server,
    ctx,
    'get_recipe',
    {
      description:
        'Reads a recipe with its ingredient lines, steps and tags. With `servings`, amounts are scaled to that many servings.',
      inputSchema: z.object({ id: z.string(), servings: z.number().optional() }),
      annotations: readOnly,
    },
    async ({ id, servings }) => {
      const recipe = await getRecipe(db, userId, id);
      return servings === undefined ? recipe : scaleRecipe(recipe, servings);
    },
  );

  defineTool(
    server,
    ctx,
    'save_recipe',
    {
      description:
        "Creates a recipe, or replaces one when `id` is given. Each line references a catalog ingredient by `ingredientId`, or proposes a new catalog entry as `newIngredient` (search the catalog first to avoid duplicates). Every amount must convert into its ingredient's canonical unit: the same unit, a conversion stored on the ingredient, or a built-in metric pair (g/kg, ml/l, tsp/tbsp). Otherwise nothing is saved and the result is an `unresolved_units` error listing each line's index and unit; convert those amounts, or add a conversion with `upsert_ingredient`, and call `save_recipe` again with the same recipe.",
      inputSchema: z.object({ id: z.string().optional(), recipe: recipeInput }),
    },
    ({ id, recipe }) =>
      id === undefined ? createRecipe(db, userId, recipe) : updateRecipe(db, userId, id, recipe),
  );

  defineTool(
    server,
    ctx,
    'delete_recipe',
    {
      description:
        'Archives a recipe: it disappears from the collection and from new planning but keeps its cook history, and the user can restore it on the website. Weeks that already plan it keep it.',
      inputSchema: z.object({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      await deleteRecipe(db, userId, id);
      return { id, archived: true };
    },
  );
}
