# @simmery/server

The one Hono service (KTD1): AuthKit sign-in, the JSON API under `/api` over `@simmery/domain`, health probes and, when `WEB_ROOT` is set, the built web app with an SPA fallback. It applies pending migrations before it listens (KTD5).

- `pnpm nx run server:dev` runs `src/main.ts` from source with the root `.env` (see `.env.example`).
- `pnpm nx run server:start` runs the build.
- Tests drive the app in-process over PGlite with a fake `SessionAuth` (`src/testing.ts`) and never call WorkOS.

The web app's typed client uses `ApiType` from `src/app.ts` with Hono's RPC client.
