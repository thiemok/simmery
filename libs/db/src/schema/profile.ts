import { pgTable, text } from 'drizzle-orm/pg-core';
import { ownerId, updatedAt } from './columns.js';

export const tasteProfiles = pgTable('taste_profiles', {
  userId: ownerId().primaryKey(),
  body: text('body').notNull().default(''),
  updatedAt: updatedAt(),
});
