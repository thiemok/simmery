import type { McpServer } from '@modelcontextprotocol/server';
import { createIngredient, listIngredients, updateIngredient } from '@simmery/domain';
import { z } from 'zod';
import { ingredientInput } from '../../routes/schemas.js';
import { defineTool, readOnly, type ToolContext } from '../result.js';

export function registerCatalogTools(server: McpServer, ctx: ToolContext) {
  const { db, userId } = ctx;

  defineTool(
    server,
    ctx,
    'list_ingredients',
    {
      description:
        "Lists the user's ingredient catalog with aliases, canonical unit, pack sizes and unit conversions. `query` matches part of a name or alias, case-insensitively.",
      inputSchema: z.object({ query: z.string().optional() }),
      annotations: readOnly,
    },
    (input) => listIngredients(db, userId, input),
  );

  defineTool(
    server,
    ctx,
    'upsert_ingredient',
    {
      description:
        'Creates a catalog ingredient, or replaces one when `id` is given. `canonicalUnit` is the unit every recipe amount is stored in and cannot change once recipes use it. `packSizes` are amounts in the canonical unit, used only for leftover estimates. `conversions` give how many canonical units one `unit` is (e.g. unit "g", factor 0.2 when the canonical unit is "clove" and a clove weighs 5 g); add one to resolve a `save_recipe` unit flag. Replacing sends the full ingredient: omitted aliases, pack sizes and conversions are removed.',
      inputSchema: ingredientInput.extend({ id: z.string().optional() }),
    },
    ({ id, ...ingredient }) =>
      id === undefined
        ? createIngredient(db, userId, ingredient)
        : updateIngredient(db, userId, id, ingredient),
  );
}
