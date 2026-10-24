import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { ingredients } from './catalog.js';
import { createdAt, id, ownedRef, ownerId, updatedAt } from './columns.js';

export const recipes = pgTable(
  'recipes',
  {
    id: id(),
    userId: ownerId(),
    title: text('title').notNull(),
    servings: integer('servings').notNull(),
    sourceUrl: text('source_url'),
    // Planned recipes are archived instead of deleted, so history keeps resolving them.
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // Import provenance (R24); no foreign key, the source may be deleted later.
    importedFromUserId: text('imported_from_user_id'),
    importedFromRecipeId: uuid('imported_from_recipe_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('recipes_user_id_id_key').on(t.userId, t.id),
    index('recipes_user_id_title_idx').on(t.userId, t.title),
  ],
);

export const recipeLines = pgTable(
  'recipe_lines',
  {
    id: id(),
    userId: ownerId(),
    recipeId: uuid('recipe_id').notNull(),
    position: integer('position').notNull(),
    ingredientId: uuid('ingredient_id').notNull(),
    amount: numeric('amount', { mode: 'number' }).notNull(),
    unit: text('unit').notNull(),
    canonicalAmount: numeric('canonical_amount', { mode: 'number' }).notNull(),
    note: text('note'),
  },
  (t) => [
    index('recipe_lines_user_id_idx').on(t.userId, t.recipeId),
    index('recipe_lines_user_id_ingredient_id_idx').on(t.userId, t.ingredientId),
    ownedRef('recipe_lines_recipe_fk', t.userId, t.recipeId, recipes).onDelete('cascade'),
    ownedRef('recipe_lines_ingredient_fk', t.userId, t.ingredientId, ingredients),
  ],
);

export const recipeSteps = pgTable(
  'recipe_steps',
  {
    id: id(),
    userId: ownerId(),
    recipeId: uuid('recipe_id').notNull(),
    position: integer('position').notNull(),
    text: text('text').notNull(),
  },
  (t) => [
    index('recipe_steps_user_id_idx').on(t.userId, t.recipeId),
    ownedRef('recipe_steps_recipe_fk', t.userId, t.recipeId, recipes).onDelete('cascade'),
  ],
);

export const recipeTags = pgTable(
  'recipe_tags',
  {
    userId: ownerId(),
    recipeId: uuid('recipe_id').notNull(),
    tag: text('tag').notNull(),
  },
  (t) => [
    primaryKey({ name: 'recipe_tags_pkey', columns: [t.recipeId, t.tag] }),
    index('recipe_tags_user_id_tag_idx').on(t.userId, t.tag),
    ownedRef('recipe_tags_recipe_fk', t.userId, t.recipeId, recipes).onDelete('cascade'),
  ],
);
