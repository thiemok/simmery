import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, ownedRef, ownerId } from './columns.js';
import { recipes } from './recipes.js';

export const shareLinks = pgTable(
  'share_links',
  {
    id: id(),
    userId: ownerId(),
    recipeId: uuid('recipe_id').notNull(),
    token: text('token').notNull().unique('share_links_token_key'),
    createdAt: createdAt(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('share_links_user_id_idx').on(t.userId, t.recipeId),
    ownedRef('share_links_recipe_fk', t.userId, t.recipeId, recipes).onDelete('cascade'),
  ],
);
