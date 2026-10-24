import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createPgliteDatabase, type Database } from './client.js';
import { migrationsFolder } from './migrate.js';

export interface TestDatabase {
  db: Database;
  close: () => Promise<void>;
}

let migratedTemplate: Promise<File | Blob> | undefined;

/**
 * Migrating a cold PGlite takes about a second, so each test worker migrates
 * once and later databases start from a dump of that data directory.
 */
function migratedDataDir(): Promise<File | Blob> {
  migratedTemplate ??= (async () => {
    const template = new PGlite();
    try {
      await migrate(drizzle(template), { migrationsFolder });
      return await template.dumpDataDir('none');
    } finally {
      await template.close();
    }
  })();
  return migratedTemplate;
}

/** A fresh in-memory Postgres with the committed migrations applied (KTD11). */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite({ loadDataDir: await migratedDataDir() });
  return { db: createPgliteDatabase(client), close: () => client.close() };
}
