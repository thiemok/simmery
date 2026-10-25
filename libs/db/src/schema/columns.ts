import { foreignKey, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const id = () => uuid('id').primaryKey().defaultRandom();

export const ownerId = () =>
  text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/**
 * Composite `(user_id, <parent>_id) -> parent (user_id, id)` reference, so a row
 * can only point at a parent owned by the same user (KTD4). Without an
 * `onDelete`, Postgres' default `no action` refuses deleting a referenced parent.
 */
export const ownedRef = (
  name: string,
  userId: AnyPgColumn,
  parentId: AnyPgColumn,
  parent: { userId: AnyPgColumn; id: AnyPgColumn },
) => foreignKey({ name, columns: [userId, parentId], foreignColumns: [parent.userId, parent.id] });
