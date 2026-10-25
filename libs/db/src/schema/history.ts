import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, smallint, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, ownedRef, ownerId } from './columns.js';
import { planEntries, weekPlans } from './planning.js';

export const cookEvents = pgTable(
  'cook_events',
  {
    id: id(),
    userId: ownerId(),
    // Default `no action`: an entry with cooked history cannot be hard-deleted (R20).
    planEntryId: uuid('plan_entry_id').notNull(),
    cookedAt: timestamp('cooked_at', { withTimezone: true }).notNull().defaultNow(),
    rating: smallint('rating'),
  },
  (t) => [
    index('cook_events_user_id_cooked_at_idx').on(t.userId, t.cookedAt),
    index('cook_events_user_id_plan_entry_id_idx').on(t.userId, t.planEntryId),
    ownedRef('cook_events_plan_entry_fk', t.userId, t.planEntryId, planEntries),
    check('cook_events_rating_check', sql`${t.rating} between 1 and 5`),
  ],
);

/** Frozen week evaluation (totals, overlap, leftovers, tag counts) for trend statistics (KTD13). */
export const weekSnapshots = pgTable(
  'week_snapshots',
  {
    id: id(),
    userId: ownerId(),
    weekPlanId: uuid('week_plan_id').notNull().unique('week_snapshots_week_plan_id_key'),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
    evaluation: jsonb('evaluation').notNull(),
  },
  (t) => [
    index('week_snapshots_user_id_idx').on(t.userId, t.takenAt),
    ownedRef('week_snapshots_week_plan_fk', t.userId, t.weekPlanId, weekPlans).onDelete('cascade'),
  ],
);
