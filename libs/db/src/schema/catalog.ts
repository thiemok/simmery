import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, ownedRef, ownerId, updatedAt } from './columns.js';

export const ingredients = pgTable(
  'ingredients',
  {
    id: id(),
    userId: ownerId(),
    name: text('name').notNull(),
    canonicalUnit: text('canonical_unit').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('ingredients_user_id_id_key').on(t.userId, t.id),
    uniqueIndex('ingredients_user_id_name_key').on(t.userId, sql`lower(${t.name})`),
  ],
);

export const ingredientAliases = pgTable(
  'ingredient_aliases',
  {
    id: id(),
    userId: ownerId(),
    ingredientId: uuid('ingredient_id').notNull(),
    alias: text('alias').notNull(),
  },
  (t) => [
    index('ingredient_aliases_user_id_idx').on(t.userId, t.ingredientId),
    uniqueIndex('ingredient_aliases_ingredient_id_alias_key').on(
      t.ingredientId,
      sql`lower(${t.alias})`,
    ),
    ownedRef('ingredient_aliases_ingredient_fk', t.userId, t.ingredientId, ingredients).onDelete(
      'cascade',
    ),
  ],
);

/** `factor` converts one `unit` into the ingredient's canonical unit (KTD6). */
export const unitConversions = pgTable(
  'unit_conversions',
  {
    id: id(),
    userId: ownerId(),
    ingredientId: uuid('ingredient_id').notNull(),
    unit: text('unit').notNull(),
    factor: numeric('factor', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('unit_conversions_user_id_idx').on(t.userId, t.ingredientId),
    unique('unit_conversions_ingredient_id_unit_key').on(t.ingredientId, t.unit),
    ownedRef('unit_conversions_ingredient_fk', t.userId, t.ingredientId, ingredients).onDelete(
      'cascade',
    ),
  ],
);

/** Pack amount in the ingredient's canonical unit. */
export const packSizes = pgTable(
  'pack_sizes',
  {
    id: id(),
    userId: ownerId(),
    ingredientId: uuid('ingredient_id').notNull(),
    amount: numeric('amount', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('pack_sizes_user_id_idx').on(t.userId, t.ingredientId),
    ownedRef('pack_sizes_ingredient_fk', t.userId, t.ingredientId, ingredients).onDelete('cascade'),
  ],
);
