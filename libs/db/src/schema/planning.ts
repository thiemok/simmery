import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, ownedRef, ownerId } from './columns.js';
import { recipes } from './recipes.js';

export const weekPlans = pgTable(
  'week_plans',
  {
    id: id(),
    userId: ownerId(),
    /** ISO week, `YYYY-Www`. */
    weekKey: text('week_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('week_plans_user_id_id_key').on(t.userId, t.id),
    unique('week_plans_user_id_week_key_key').on(t.userId, t.weekKey),
  ],
);

export const planEntries = pgTable(
  'plan_entries',
  {
    id: id(),
    userId: ownerId(),
    weekPlanId: uuid('week_plan_id').notNull(),
    recipeId: uuid('recipe_id').notNull(),
    servings: integer('servings').notNull(),
    /** Optional ISO weekday, 1 (Monday) to 7. */
    day: smallint('day'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('plan_entries_user_id_id_key').on(t.userId, t.id),
    index('plan_entries_user_id_week_plan_id_idx').on(t.userId, t.weekPlanId),
    index('plan_entries_user_id_recipe_id_idx').on(t.userId, t.recipeId),
    ownedRef('plan_entries_week_plan_fk', t.userId, t.weekPlanId, weekPlans).onDelete('cascade'),
    ownedRef('plan_entries_recipe_fk', t.userId, t.recipeId, recipes),
    check('plan_entries_servings_check', sql`${t.servings} > 0`),
    check('plan_entries_day_check', sql`${t.day} between 1 and 7`),
  ],
);
