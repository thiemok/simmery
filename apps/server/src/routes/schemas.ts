import { z } from 'zod';

/** Shape only; the domain owns the rules (non-empty names, positive amounts). */
export const idParam = z.object({ id: z.string() });

export const ingredientInput = z.object({
  name: z.string(),
  aliases: z.array(z.string()).optional(),
  canonicalUnit: z.string(),
  packSizes: z.array(z.number()).optional(),
  conversions: z.array(z.object({ unit: z.string(), factor: z.number() })).optional(),
});

// `never` rather than `undefined` keeps the other key out: MCP lists these
// schemas as JSON Schema, and zod cannot convert `undefined`.
const lineSource = z.union([
  z.object({ ingredientId: z.string(), newIngredient: z.never().optional() }),
  z.object({ newIngredient: ingredientInput, ingredientId: z.never().optional() }),
]);

export const recipeInput = z.object({
  title: z.string(),
  servings: z.number(),
  lines: z.array(
    z.intersection(
      lineSource,
      z.object({ amount: z.number(), unit: z.string(), note: z.string().nullish() }),
    ),
  ),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
  sourceUrl: z.string().nullish(),
});

export const importInput = z.object({
  lines: z.array(
    z.intersection(
      lineSource,
      z.object({ amount: z.number().optional(), unit: z.string().optional() }),
    ),
  ),
});

export const weekEntries = z.array(
  z.object({
    id: z.string().optional(),
    recipeId: z.string(),
    servings: z.number(),
    day: z.number().nullish(),
  }),
);

export const candidateEntries = z.array(z.object({ recipeId: z.string(), servings: z.number() }));

/** Query strings arrive as text; `true` and `false` are the only booleans. */
export const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

export const positiveIntQuery = z
  .string()
  .regex(/^\d+$/, 'must be a whole number')
  .transform((value) => Number(value));
