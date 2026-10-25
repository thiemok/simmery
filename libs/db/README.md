# @simmery/db

Drizzle schema, migrations and database clients for Simmery.

- `src/schema/` holds one file per area. Every owned table carries `user_id`, and references between owned rows are composite `(user_id, id)` foreign keys, so a row cannot point at another user's row.
- `migrations/` holds the generated SQL. After changing the schema, run `pnpm nx run @simmery/db:db-generate -- --name=<change>` and commit the result; running it again must report no schema changes.
- `migrate(pool)` applies pending migrations under a Postgres advisory lock, for use at service startup.
- `@simmery/db/testing` exports `createTestDatabase()`, a fresh in-memory PGlite database with the migrations applied, for tests.
