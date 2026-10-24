import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ingredients } from './catalog.js';
import { createdAt, id, ownedRef, ownerId } from './columns.js';
import { weekPlans } from './planning.js';

/** Check-off state per aggregated list line; last write wins by client timestamp (KTD8). */
export const listItemStates = pgTable(
  'list_item_states',
  {
    userId: ownerId(),
    weekPlanId: uuid('week_plan_id').notNull(),
    ingredientId: uuid('ingredient_id').notNull(),
    checked: boolean('checked').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ name: 'list_item_states_pkey', columns: [t.weekPlanId, t.ingredientId] }),
    index('list_item_states_user_id_idx').on(t.userId, t.weekPlanId),
    ownedRef('list_item_states_week_plan_fk', t.userId, t.weekPlanId, weekPlans).onDelete(
      'cascade',
    ),
    ownedRef('list_item_states_ingredient_fk', t.userId, t.ingredientId, ingredients).onDelete(
      'cascade',
    ),
  ],
);

export const listExtras = pgTable(
  'list_extras',
  {
    id: id(),
    userId: ownerId(),
    weekPlanId: uuid('week_plan_id').notNull(),
    text: text('text').notNull(),
    checked: boolean('checked').notNull().default(false),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('list_extras_user_id_idx').on(t.userId, t.weekPlanId),
    ownedRef('list_extras_week_plan_fk', t.userId, t.weekPlanId, weekPlans).onDelete('cascade'),
  ],
);
