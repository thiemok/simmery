# @simmery/server

The one Hono service (KTD1): AuthKit sign-in, the JSON API under `/api` and the remote MCP server under `/mcp`, both over `@simmery/domain`, health probes and, when `WEB_ROOT` is set, the built web app with an SPA fallback. It applies pending migrations before it listens (KTD5).

- `pnpm nx run server:dev` runs `src/main.ts` from source with the root `.env` (see `.env.example`).
- `pnpm nx run server:start` runs the build.
- Tests drive the app in-process over PGlite with a fake `SessionAuth` and access tokens signed by an in-process key (`src/testing.ts`), and never call WorkOS.

`/mcp` is a stateless MCP endpoint (SDK v2): it accepts AuthKit access tokens whose audience is `${PUBLIC_BASE_URL}/mcp`, builds a new server for each request bound to the token's user, and maps each tool onto one domain call (`src/mcp/`). OAuth clients discover AuthKit through `/.well-known/oauth-protected-resource/mcp`. In the WorkOS dashboard, register `${PUBLIC_BASE_URL}/mcp` as a Resource Indicator and enable Client ID Metadata Documents and Dynamic Client Registration.

The web app's typed client uses `ApiType` from `src/app.ts` with Hono's RPC client.
