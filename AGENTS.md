# Simmery

Recipe management system for an invite-only group: per-user recipes and ingredient catalogs, weekly meal plans, an offline-capable shopping list, cooking view, statistics, a freeform taste profile, recipe sharing, and a remote MCP server so a user's agent can plan weeks and add recipes.

The product contract lives in `docs/plans/`. Read the latest plan before starting feature work; implementation plans enrich that same file.

# Basic Instructions

- No obvious comments. Do not add comments that do not add additional details when a block of code is already providing same information via a function name, variable name, or log statement.
- Full-stack TypeScript, Postgres, Nx/pnpm monorepo. Apps go under `apps/`, shared code under `libs/`.
- The web API and the MCP server share one domain layer; never duplicate business rules between them.
- All user data is owned by exactly one user. Every query and MCP tool must be scoped to the authenticated user.
- Use Conventional Commits (`feat:`, `fix:`, `chore:` …); releases will be derived from them.

# Working with Nx

- Run tasks through Nx (`pnpm nx run`, `pnpm nx run-many`, `pnpm nx affected`) instead of the underlying tools.
- Prefix nx commands with `pnpm` to use the workspace-local CLI.
- For scaffolding (apps, libs), use Nx generators; never guess CLI flags, check `--help` or the Nx docs first.

# Development

- Node version is pinned in `.nvmrc`; install with `pnpm install`.
- Local Postgres: `docker compose up -d`. Copy `.env.example` to `.env`; every variable the server reads is listed there.
- Tests run on PGlite and need no running database.
- Common tasks: `pnpm nx affected -t lint typecheck test build` (what CI runs), `pnpm nx run <project>:<target>` for one project, `pnpm nx format:write` before committing (oxfmt; CI runs `nx format:check`, `docs/` is excluded).
- TypeScript is pinned to the 6.0 line (`~6.0.3`) that Nx 24 supports; do not bump to 7.x until Nx does.
- New projects use the Nx TS solution setup: generators register them in the root `tsconfig.json` references, and `build`, `typecheck`, `lint` and `test` targets are inferred by the plugins in `nx.json`.
- Linting is oxlint (`.oxlintrc.json` at the root, `lint` target inferred by `@nx/oxlint`); formatting is oxfmt (`.oxfmtrc.json`). There is no ESLint or Prettier: pass `--linter=none` to generators that offer a linter.
