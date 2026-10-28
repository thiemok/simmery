import { users, type Database } from '@simmery/db';
import { sql } from 'drizzle-orm';

export interface UserIdentity {
  /** WorkOS user ID (KTD4). */
  id: string;
  email: string;
}

/**
 * Creates the local user on their first authenticated request and keeps the
 * email in step with WorkOS. Racing first requests still create one row.
 */
export async function ensureUser(db: Database, identity: UserIdentity): Promise<void> {
  await db
    .insert(users)
    .values(identity)
    .onConflictDoUpdate({
      target: users.id,
      set: { email: identity.email },
      setWhere: sql`${users.email} is distinct from excluded.email`,
    });
}
