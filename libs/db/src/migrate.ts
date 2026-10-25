import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as runMigrations } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

/** Resolves to `libs/db/migrations` from both `src/` and the built `dist/`. */
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

const MIGRATION_LOCK_ID = 7_355_213_901;

/**
 * Applies pending migrations while holding a session-level advisory lock, so
 * replicas starting together run them once (KTD5). The lock and the migrator
 * share one pooled connection, since advisory locks belong to a session.
 */
export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    try {
      await runMigrations(drizzle(client), { migrationsFolder });
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}
