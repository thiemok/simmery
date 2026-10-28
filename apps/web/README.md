# @simmery/web

The mobile-first React SPA (KTD9) in the Dawn Outrun identity (`docs/plans/2026-10-24-2123-feat-visual-identity-plan.md`). It talks to the server through Hono's typed RPC client over `ApiType`, with TanStack Router (code-based routes in `src/router.tsx`) and TanStack Query. Tokens live in `src/styles/tokens.css`; components use CSS Modules; fonts are self-hosted from `@fontsource` (KTD14).

- `pnpm nx run web:serve` starts Vite on port 4200 and forwards `/api`, `/auth`, `/mcp` and `/.well-known` to `server:dev` on port 3000. Set `PUBLIC_BASE_URL=http://localhost:4200` in `.env` while developing this way.
- `pnpm nx run web:test` runs the component tests in jsdom over a fake `/api` (`src/test/fake-api.tsx`).
- `pnpm nx run web:e2e` builds the app and runs Playwright against the real server over PGlite with the fake session from `@simmery/server/testing` (KTD15, `e2e/server.ts`). Install the browser once with `pnpm --filter @simmery/web exec playwright install chromium`.
- `pnpm nx run web:build` writes `dist/`, which the server serves when `WEB_ROOT` points at it.
