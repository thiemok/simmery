import type { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import type { Pool } from 'pg';
import * as schema from './schema/index.js';

export type Schema = typeof schema;

/** Driver-independent handle the domain layer works against. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export function createDatabase(pool: Pool): Database {
  return drizzleNodePostgres(pool, { schema });
}

export function createPgliteDatabase(client: PGlite): Database {
  return drizzlePglite(client, { schema });
}
