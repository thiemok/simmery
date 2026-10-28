---
title: Simmery Foundation - Plan
type: feat
date: 2026-10-24
topic: simmery-foundation
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Simmery Foundation - Plan

## Goal Capsule

- **Objective:** A small invited group can run their weekly cooking without a meal box: keep their own recipes, plan a week (alone or with an AI agent), shop from one aggregated list in the store, and cook from scaled recipes, with little food wasted.
- **Product authority:** This Product Contract. It covers the whole thin v1 loop (recipes, ingredients, weekly plan, shopping, cooking, statistics, taste profile, sharing, MCP access) at basic depth. Deepening any single area is later work.
- **Means:** One TypeScript service (Hono + Drizzle on Postgres) serving a React PWA, a typed JSON API and a remote MCP endpoint over one shared domain library, signed in through WorkOS AuthKit (KTD1, KTD2, KTD3).
- **Authority order:** Product Contract Requirements win on behavior; Planning Contract KTDs win on mechanism; units carry only local detail.
- **Stop conditions:** Stop and ask if a requirement cannot be met as written, if WorkOS AuthKit cannot gate sign-up to invitations or serve MCP OAuth, or if a unit would need data shared across users.
- **Execution profile:** Units U1–U10 and U12 land as separate PRs in dependency order; U11 builds and publishes the image and chart, while the live rollout waits on the cluster prerequisites (THI-49, THI-50).
- **Open blockers:** None for building U1–U11. The live rollout at the end of U11 waits on THI-49 (public exposure path) and THI-50 (Postgres on the cluster).
- **Product Contract preservation:** changed: R17 (per-line pack suggestions) removed and AE2 rewritten — the user decided during plan review that buying packs is left to them and pack sizes only drive least-waste leftover estimates. Outstanding Questions resolved during planning were removed and now live in KTDs.

---

## Product Contract

### Summary

Simmery is a self-hosted recipe and meal-planning system with a mobile-first website and a remote MCP server over the same per-user data.
The website covers recipe entry, manual weekly planning, an offline-capable shopping list, a cooking view and statistics.
The MCP server lets a user's own AI agent propose weeks, maintain the taste profile and add recipes.

### Problem Frame

The primary user has relied on meal-box delivery services for a long time and is moving away from them.
The boxes provided three conveniences that disappear with them: the week's meals were chosen for you, the ingredients arrived in amounts that matched the meals so little went to waste, and every meal came with a clear step-by-step card.
Today, finding recipes happens through web search and nothing connects choosing meals, buying ingredients and cooking them.
Friends in the same situation would benefit from the same tool and from passing good recipes to each other.

### Actors

- A1. User — an invited person with their own account, data and taste profile.
- A2. User's agent — an AI agent (e.g. Claude) connected to Simmery over MCP, acting with that user's permissions only.
- A3. Link viewer — anyone holding a recipe share link, with or without an account.

### Key Decisions

- **Invite-only circle now, public sign-up possible later.** Accounts are per person; nothing assumes a single household or a single operator beyond the invite gate. Governs R1, R2.
- **Every user owns their own ingredient catalog** (session-settled: user-directed — chosen over one shared global catalog: no single user can be trusted with edits that change everyone's recipe data, and correcting duplicates across users gets complicated). Governs R3, R4, R5, R6, R23.
- **Each ingredient has one canonical unit and any number of pack sizes** (session-settled: user-directed — added during synthesis review: several pack sizes are often available, and a stored unit makes mismatches like "2 cloves + 50 g" detectable at entry and keeps a user's data consistent). Governs R4, R5, R6, R13.
- **Recipes enter through the MCP agent or a manual web form** (session-settled: user-directed — chosen over server-side URL import and photo/OCR: the agent already covers pasted pages). Governs R7, R8.
- **Finding new recipes is outside Simmery.** Discovery happens in web search or in the agent's own tools; Simmery stores what it is given. Governs R8.
- **Weekly plans and shopping lists belong to one user** (session-settled: user-directed — chosen over household groups and shareable plans: keep the model simple). Governs R10.
- **A week is a set of meals, not a calendar.** Like a meal box, a week holds N recipes each with a serving count; putting them on days is optional. Governs R10, R11.
- **The planning intelligence lives in the agent, not the backend** (session-settled: user-approved — chosen over a built-in suggestion heuristic and an embedded on-site LLM chat: no model costs or keys in the product). The site supports manual planning with overlap and leftover feedback. Governs R12, R13, R25.
- **The taste profile is freeform notes the agent maintains** (session-settled: user-directed — chosen over structured preferences and structured-plus-notes). As a result the system enforces no allergies or exclusions; that responsibility sits with the agent and the user. Governs R21, R22.
- **Sharing is a read-only link plus import-as-copy** (session-settled: user-directed — chosen over copy-only, live shared recipes and link-only). Governs R23, R24.
- **Shopping mode is an installable, offline-capable checklist** (session-settled: user-approved — chosen over online-only and exporting to another app: stores have bad reception). Governs R15.
- **Hosting: the user's home k3s cluster, publicly reachable** (session-settled: user-approved — chosen over tailnet-only and a managed cloud host: remote MCP connectors such as claude.ai need a public HTTPS endpoint). Governs R2, R27.
- **Authentication through a managed auth service** (session-settled: user-directed — chosen over social login with the app as its own OAuth server, a self-hosted IdP, and passkeys/magic links). The same identity backs website sessions and MCP OAuth. Governs R1, R26.
- **Full-stack TypeScript** (session-settled: user-directed — chosen over a Go API with a TS SPA and over a TS meta-framework). One TypeScript backend serves the web API and the MCP endpoint over one domain layer; a separate TS frontend; Postgres for storage. Delivery mirrors `tiny-dash`: Nx/pnpm monorepo, container images on GHCR, Helm chart, OpenTelemetry to Dash0, conventional-commit releases.

### Requirements

**Accounts and access**

- R1. People sign in through the managed auth provider, and only invited email addresses can create an account.
- R2. Every piece of user data (recipes, catalog, plans, lists, history, profile) is visible and editable only by its owner, except recipes reached through a share link (R23).

**Ingredient catalog**

- R3. Each user has a private catalog of ingredients; every recipe ingredient line references an entry in the owner's catalog.
- R4. A catalog ingredient has a name, optional aliases, one canonical unit (e.g. g, ml, piece, clove) and zero or more common pack sizes expressed in that unit.
- R5. An ingredient can carry conversions from other units into its canonical unit (e.g. "1 clove ≈ 5 g", "1 tbsp ≈ 15 ml").
- R6. Whenever a recipe amount arrives in a unit that is neither the canonical unit nor covered by a conversion (form, agent or import), it is flagged at entry and must be resolved by converting it or adding a conversion before it is saved.

**Recipes**

- R7. A user can create and edit recipes on the website: title, servings, ingredient lines (catalog ingredient, amount, unit, optional note), ordered steps, tags (e.g. cuisine, protein, vegetarian) and an optional source URL.
- R8. The agent can create and edit recipes over MCP with the same fields, including matching ingredient lines to existing catalog entries or proposing new ones.
- R9. Ingredient entry on the website autocompletes against the user's catalog and offers to create a new entry when nothing matches.

**Weekly plan**

- R10. A user has one plan per week holding a set of recipes, each with its own serving count and an optional day.
- R11. A user can add, remove and re-serve recipes in a week on the website, and the agent can do the same over MCP.
- R12. While planning, the website shows the week's ingredient overlap (ingredients used by more than one meal) and estimated leftovers.
- R13. Leftover estimates use the closest fit from an ingredient's pack sizes against the week's total; ingredients without pack sizes show no leftover estimate.

**Shopping**

- R14. A week's shopping list sums amounts per catalog ingredient across all planned meals, scaled to their serving counts, in the canonical unit.
- R15. The shopping list works on a phone as an installable app; the current list is available offline and check-offs made offline sync when connectivity returns.
- R16. A user can add free-text extra items to the list.

**Cooking**

- R18. A recipe view scales ingredient amounts to the planned serving count and presents steps one at a time or as a list, readable on a phone.
- R19. After cooking, a user marks the meal cooked and optionally rates it.

**Statistics**

- R20. The website shows per-user statistics: cook history (how often and when each recipe was cooked, recipes not cooked in a while), ratings over time, variety across tags per week, most-bought ingredients, and leftover and overlap trends per week.

**Taste profile**

- R21. Each user has one freeform taste profile document, editable on the website.
- R22. The agent can read and update the taste profile over MCP.

**Sharing**

- R23. A user can create a read-only share link for a recipe; anyone with the link can view it without an account, and the owner can revoke the link.
- R24. A signed-in viewer can import a shared recipe as their own copy; during import every ingredient line is mapped to the importer's catalog (existing or new entries), unit checks per R6 apply, and the copy records whom it came from.

**MCP server**

- R25. The MCP server exposes tools for the user's recipes, catalog, weekly plans, shopping list, cook history, statistics and taste profile, including a tool to evaluate a candidate week (overlap, leftovers, variety) without saving it.
- R26. MCP clients authenticate with OAuth against the same identity as the website and act only as that user.
- R27. The MCP server is reachable over public HTTPS so remote connectors (claude.ai web and mobile) and local agents (Claude Code) can both use it.

### Key Flows

- F1. Agent-planned week
  - **Trigger:** The user asks their agent to plan next week.
  - **Actors:** A1, A2
  - **Steps:** The agent reads the taste profile, cook history and ratings; selects candidate recipes; evaluates candidate weeks for overlap, leftovers and variety; saves the chosen week with serving counts; the user adjusts it on the website.
  - **Covered by:** R10, R11, R12, R20, R22, R25
- F2. Shop and cook
  - **Trigger:** A week is planned.
  - **Actors:** A1
  - **Steps:** The user opens the shopping list on the phone, adds extras, shops offline, checks items off; later cooks each meal from the scaled recipe view and marks it cooked with a rating.
  - **Covered by:** R14, R15, R16, R18, R19
- F3. Agent adds a found recipe
  - **Trigger:** The user hands their agent a recipe page or text.
  - **Actors:** A1, A2
  - **Steps:** The agent structures the recipe, matches each ingredient to the user's catalog or proposes new entries, resolves unit mismatches, and saves it.
  - **Covered by:** R6, R8
- F4. Share and import
  - **Trigger:** A user wants to pass a recipe to a friend.
  - **Actors:** A1, A3
  - **Steps:** The owner creates a share link; the friend opens it; if signed in, they import, map the ingredients to their catalog, resolve unit flags and save their copy.
  - **Covered by:** R6, R23, R24

### Acceptance Examples

- AE1. **Covers R6.** Given "garlic" has canonical unit `clove` and no gram conversion, when a recipe line says "50 g garlic", saving is blocked with a flag until the user (or agent) converts the amount or adds a conversion such as "1 clove ≈ 5 g".
- AE2. **Covers R13.** Given cream has pack sizes 200 ml and 500 ml and the week needs 350 ml, the planning view shows about 50 ml left over (the least-waste combination, two 200 ml packs); the shopping list shows only the 350 ml total.
- AE3. **Covers R13.** Given fresh coriander has no pack sizes, it appears on the list with its summed amount and no leftover estimate.
- AE4. **Covers R15.** Given the phone loses reception in the store, the user can still see the list and check items off, and the check-offs appear on other devices once the phone is back online.
- AE5. **Covers R23.** Given the owner revokes a share link, opening that link shows that the recipe is no longer shared; copies already imported are unaffected.
- AE6. **Covers R2, R26.** Given an agent authenticated as user A, any request for user B's recipes, plans or profile is refused.

### Scope Boundaries

**Deferred for later**

- Server-side URL import (schema.org Recipe parsing) and photo/OCR of cookbooks or recipe cards.
- Pantry or stock tracking ("I already have rice") reducing the shopping list.
- Households or shared plans and lists between users.
- Structured, system-enforced dietary constraints and allergies.
- A built-in suggestion engine or embedded LLM chat on the website.
- Opening public sign-up, plus the abuse handling and privacy work it needs.
- Store aisle ordering, prices and grocery delivery integration.
- Nutrition information.

**Outside this product's identity**

- Recipe discovery or search across the web — Simmery stores and plans; finding recipes belongs to the user and their agent.
- A shared, community-curated ingredient database.

### Dependencies / Assumptions

- WorkOS AuthKit supports invite-gated sign-up and acts as the OAuth authorization server MCP clients need (see KTD3).
- The home cluster can be exposed publicly for one hostname with TLS (traefik is present; the exposure path, such as a public domain or tunnel, is not chosen yet).
- No Postgres runs on the cluster today; one has to be provisioned.
- The user and their agent fill in pack sizes and conversions over time; waste figures are only as good as that data.
- English UI; recipe content in any language.

### Outstanding Questions

**Deferred to Planning**

- How the cluster is exposed publicly (port forward with a public domain, Cloudflare Tunnel or Tailscale Funnel) and which domain is used. Tracked as THI-49; the plan only needs a hostname and TLS at the ingress.
- How Postgres is run on the cluster (an operator such as CloudNativePG vs a single StatefulSet) and how it is backed up. Tracked as THI-50; the service only needs a connection string.

### Sources / Research

- `tiny-dash` (sibling repo next to this one): reference for the Nx/pnpm monorepo, GHCR image and Helm chart release flow (`DEPLOYMENT.md`), and OpenTelemetry conventions.
- `kubernetes` (sibling repo next to this one): k3s cluster with traefik, tailscale operator, 1Password operator for secrets, local-path storage and the Dash0 operator; no database or identity provider present.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **One deployable service on Hono.** A single Node process serves the built web app as static files, the JSON API under `/api`, and the MCP endpoint under `/mcp`, behind one hostname (session-settled: user-approved — chosen over separate web, API and MCP deployments: one origin keeps cookies, OAuth metadata, Helm and releases simple). Hono was picked over Fastify/Express because the MCP SDK ships a Hono adapter and Hono's RPC client gives the web app end-to-end types without a schema layer. Governs R25, R27.
- KTD2. **Shared domain library owns every business rule.** `libs/domain` holds catalog, unit resolution, recipes, planning, shopping, cooking, statistics, profile and sharing logic as plain functions taking an explicit `userId`; the API and MCP layers are thin adapters with input validation (zod). This keeps web/agent parity structural instead of tested-in (see AGENTS.md rule on one domain layer). Governs R2, R8, R11, R22, R25.
- KTD3. **WorkOS AuthKit for identity** (session-settled: user-approved — chosen over Clerk: AuthKit documents both invite-only sign-up and acting as the MCP authorization server; no invite-only control was found for Clerk). Website: AuthKit hosted login with server-side code exchange and a sealed session cookie. MCP: AuthKit is the authorization server, the service publishes OAuth protected-resource metadata (RFC 9728) and verifies AuthKit access tokens against its JWKS with the MCP URL as resource indicator. Client ID Metadata Documents are enabled, with Dynamic Client Registration on for older clients. Public sign-up is disabled in the WorkOS environment; invitations are sent from the WorkOS dashboard. Governs R1, R26.
- KTD4. **Local user rows keyed by WorkOS user ID.** On first authenticated request (web or MCP) a local `users` row is created from the WorkOS user ID and email; every owned table carries `user_id` and every domain query filters by it. Every ID a caller supplies in a write or evaluation payload (ingredient, recipe, plan entry, import mapping) is checked against the caller and treated as not found otherwise; child references use composite `(user_id, id)` foreign keys so a row can never point at another user's row. No row-level-security in Postgres for v1; ownership is enforced in `libs/domain` and the schema, and covered by cross-user tests. Governs R2.
- KTD5. **Postgres via Drizzle ORM with drizzle-kit migrations.** Migrations are generated SQL files committed under `libs/db/migrations` and applied by the service at startup behind an advisory lock. Amounts are stored as `numeric` in the ingredient's canonical unit. Governs R3–R6.
- KTD6. **Units and conversions are per ingredient, not global.** Each ingredient stores its canonical unit plus a list of `(unit, factor)` conversions into it; a small built-in table covers unambiguous metric pairs (g↔kg, ml↔l, tsp/tbsp↔ml) and is applied only where both units share a dimension with the canonical unit. A recipe line stores the amount as entered and the normalized canonical amount; saving is refused while any line cannot be normalized. Governs R4, R5, R6, R14.
- KTD7. **Pack fit picks least excess, then fewest packs.** For a needed canonical amount and an ingredient's pack sizes, compute the cheapest combination by a bounded unbounded-knapsack search (pack sizes are few, totals small) minimizing purchased − needed, tie-broken by pack count. Leftover = excess of that combination. Used only for leftover estimates; the shopping list shows totals, not pack suggestions (session-settled: user-directed — chosen over fewest-packs-first and over per-line pack suggestions: buying packs is left to the user, the system only minimizes waste). Governs R13.
- KTD8. **Offline shopping via service worker + IndexedDB op queue.** `vite-plugin-pwa` (Workbox) precaches the app shell; the shopping list view caches the latest list in IndexedDB; check-off and extra-item changes are queued as operations with client timestamps and replayed on reconnect; the server applies them last-write-wins per item using the client timestamp. Only the shopping list works offline. Governs R15, R16.
- KTD9. **Web app: React + Vite + TanStack Router + TanStack Query.** Plain SPA served by the service; Hono RPC client for typed calls. Mobile-first layout; no component framework is mandated. Governs R7, R9, R12, R18, R20, R21.
- KTD10. **MCP via the official TypeScript SDK v2 with the Hono adapter, stateless.** `@modelcontextprotocol/server` + `@modelcontextprotocol/hono`; a new server instance is built per request from the verified `authInfo`, so each tool call is bound to one user. Tools map one-to-one onto domain operations plus `evaluate_week`. Governs R8, R22, R25, R26.
- KTD11. **Tests run on PGlite.** Domain and API tests run against in-process Postgres (PGlite) with the real migrations applied, so CI and local tests need no Docker; local development uses a `docker compose` Postgres. Governs the Verification Contract.
- KTD12. **Delivery mirrors tiny-dash.** Nx/pnpm workspace (Nx bumped to the current major, v24), GitHub Actions CI on `nx affected`, `nx release` from conventional commits producing `server-v<X.Y.Z>` tags, a container image on GHCR and a Helm chart inside the server project pushed to `oci://ghcr.io/thiemok/charts/simmery`. Observability relies on the Dash0 operator's Node auto-instrumentation plus structured JSON logs (pino); no secrets, recipe text or emails in logs. Governs R27.
- KTD13. **Weekly snapshots for waste and purchase history; everything else on read** (session-settled: user-approved — chosen over computing all statistics live: later edits to recipes, pack sizes or conversions would otherwise rewrite past weeks). When a week's shopping list is first used (first check-off) or the week ends, the week's evaluation (per-ingredient totals, overlap, leftovers, tag counts) is stored as a snapshot; past-week leftover, overlap and most-bought trends read from snapshots. Cook history and ratings are aggregated at request time. Governs R20.

### High-Level Technical Design

Component topology:

```mermaid
flowchart TB
  phone[Phone / browser PWA] -->|HTTPS cookie session| svc
  agent[MCP client: claude.ai, Claude Code] -->|HTTPS bearer token| svc
  agent -->|OAuth| workos[WorkOS AuthKit]
  phone -->|hosted login| workos
  subgraph svc[simmery server - one process]
    static[Static web app]
    api[/api - Hono routes/]
    mcp[/mcp - MCP SDK Hono adapter/]
    auth[Auth middleware: session cookie or JWT via JWKS]
    domain[libs/domain]
    db[libs/db - Drizzle]
    api --> auth
    mcp --> auth
    api --> domain
    mcp --> domain
    domain --> db
  end
  db --> pg[(Postgres)]
  svc -.->|auto-instrumented OTel| dash0[Dash0]
```

Data model (directional; exact columns are an implementation detail):

```mermaid
erDiagram
  USER ||--o{ INGREDIENT : owns
  USER ||--o{ RECIPE : owns
  USER ||--o{ WEEK_PLAN : owns
  USER ||--|| TASTE_PROFILE : has
  INGREDIENT ||--o{ INGREDIENT_ALIAS : has
  INGREDIENT ||--o{ UNIT_CONVERSION : has
  INGREDIENT ||--o{ PACK_SIZE : has
  RECIPE ||--o{ RECIPE_LINE : has
  RECIPE ||--o{ RECIPE_STEP : has
  RECIPE ||--o{ RECIPE_TAG : has
  RECIPE ||--o{ SHARE_LINK : has
  RECIPE_LINE }o--|| INGREDIENT : uses
  WEEK_PLAN ||--o{ PLAN_ENTRY : has
  PLAN_ENTRY }o--|| RECIPE : schedules
  PLAN_ENTRY ||--o{ COOK_EVENT : records
  WEEK_PLAN ||--o{ LIST_ITEM_STATE : tracks
  WEEK_PLAN ||--o{ LIST_EXTRA : has
  WEEK_PLAN ||--o| WEEK_SNAPSHOT : freezes
```

Recipe line normalization at save (R6, KTD6):

```mermaid
flowchart TB
  A[Line: amount + unit + ingredient] --> B{unit == canonical?}
  B -->|yes| OK[store canonical amount]
  B -->|no| C{ingredient conversion for unit?}
  C -->|yes| OK
  C -->|no| D{built-in metric pair, same dimension?}
  D -->|yes| OK
  D -->|no| F[flag line: unresolved unit]
  F --> G[reject save with per-line flags]
  G --> H[user/agent converts amount or adds conversion]
  H --> A
```

Offline check-off sync (R15, KTD8):

```mermaid
sequenceDiagram
  participant UI as Shopping list UI
  participant IDB as IndexedDB
  participant API as /api/lists
  UI->>IDB: toggle item (op + client timestamp)
  UI->>API: try send op
  alt offline
    API--xUI: network error
    Note over IDB: op stays queued
  end
  UI->>API: on reconnect, replay queued ops in order
  API->>API: apply last-write-wins per item by client timestamp
  API-->>UI: current list state
  UI->>IDB: replace cached list, clear sent ops
```

MCP tool surface (directional names; one tool per domain operation, all scoped to the token's user):

| Area | Tools |
|---|---|
| Catalog | `list_ingredients`, `upsert_ingredient` (aliases, unit, pack sizes, conversions) |
| Recipes | `search_recipes`, `get_recipe`, `save_recipe` (returns per-line unit flags on rejection), `delete_recipe` |
| Planning | `get_week`, `set_week_entries`, `evaluate_week` (overlap, leftovers, tag variety, no save) |
| Shopping | `get_shopping_list` |
| History | `get_cook_history`, `get_statistics` |
| Profile | `get_taste_profile`, `update_taste_profile` |

### Output Structure

```text
apps/
  server/            Hono app: auth, /api routes, /mcp, static hosting, Dockerfile, chart/
  web/               React + Vite PWA
libs/
  db/                Drizzle schema, migrations, client factory (Postgres + PGlite)
  domain/            business rules, one module per area
  units/             unit dimensions, built-in conversions, pack fit (pure, no DB)
docker-compose.yml   local Postgres
```

### Assumptions

- WorkOS free tier covers ~30 users and invite-only sign-up without a paid plan.
- claude.ai and Claude Code accept AuthKit as an MCP authorization server via Client ID Metadata Documents or DCR.
- Week boundaries use ISO weeks (Monday start) in the user's browser time zone; the week key is `YYYY-Www`. The domain stores no time zone, so it decides that a week has ended (for its snapshot) in UTC; for zones far from UTC a snapshot can land up to about half a day early or late, which is acceptable for trend statistics (U5).
- A share link is an unguessable random token in the URL; a revoked token returns a "no longer shared" page.
- The built-in unit registry is metric (`mg`, `g`, `kg`, `ml`, `cl`, `dl`, `l`), kitchen spoons (`tsp` 5 ml, `tbsp` 15 ml) and count-like units (`piece`, `clove`, `pinch`, `bunch`, `slice`, `sprig`, `can`); `cup`, `fl oz`, `oz` and `lb` are left out as ambiguous and enter only as per-ingredient conversions (U3).
- Deleting a recipe always archives it (hidden from the collection and from new planning; existing plan entries keep it until removed) rather than removing it, so the user can restore it and history stays intact for R20. A later cleanup job removes archived recipes after a retention period (THI-62).

### Risks & Dependencies

| Risk | Decision |
|---|---|
| MCP auth spec and client support shift (CIMD vs DCR, resource indicators) | Keep both CIMD and DCR enabled in WorkOS; isolate token verification in `apps/server/src/auth/jwt.ts` so a change touches one file. |
| MCP SDK v2 is young (2.x, stable since the 2026-07-28 spec) | Pin exact minor versions; MCP tests use the SDK client end to end so an upgrade regression shows up in CI. |
| WorkOS outage blocks sign-in and MCP | Accepted for a small private group; web sessions with a valid access token keep working, requests needing a refresh get 503 until WorkOS recovers, and the cookie is kept so nobody is logged out (U7). Not mitigated further. |
| Public exposure of the home cluster | Only the one hostname is exposed; all `/api` and `/mcp` routes require auth except `GET /api/share/:token`, `/healthz`, `/readyz` and OAuth metadata (importing a shared recipe needs a session). Rate limiting is not built in v1; revisit if share links get abused. |
| Agent writes bad data (wrong amounts, duplicate ingredients) | Unit normalization (R6) catches unit errors; duplicates are a per-user cleanup problem by design (Key Decision on per-user catalogs). No approval step for agent writes in v1. |
| Cross-user leakage through a missed filter | Every domain module and both adapters carry cross-user tests (Definition of Done). |

### Sequencing

U1 → U2 → U3 → U12 → U4 → U5 → U6 → U7 → (U8, U9) → U10 → U11. U3 (`libs/units`) needs only U1 and can land before or in parallel with U2; U12 (catalog) needs both U2 and U3. U3 and U12 were one unit until the U3 deepening on 2026-10-24 split them so the pure library can ship while U2 is open; Linear THI-53 covers both.

---

## Implementation Units

### U1. Workspace toolchain

- **Goal:** A TypeScript Nx workspace where libs and apps can be generated, linted, type-checked and tested in CI.
- **Requirements:** Supports all; KTD11, KTD12.
- **Dependencies:** None.
- **Files:** `package.json`, `nx.json`, `tsconfig.base.json`, `.oxlintrc.json`, `.oxfmtrc.json`, per-project `vitest.config.ts`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `AGENTS.md`.
- **Approach:**
  1. Bump `nx` and `@nx/workspace` to the current major and add `@nx/js`, `@nx/vite`, `@nx/vitest`, `@nx/react`, `@nx/oxlint`; test targets are inferred from per-project `vitest.config.ts` (Vitest 4+ dropped the root workspace file).
  2. Shared strict TS config (`"types": ["node"]`, required by MCP SDK v2 typings), oxlint and oxfmt (session-settled: user-directed — chosen over ESLint and Prettier; generators run with `--linter=none`).
  3. `docker-compose.yml` with Postgres for local dev and `.env.example` listing every variable the server reads.
  4. CI keeps `pnpm nx affected -t lint test build` and adds `typecheck`.
  5. Update `AGENTS.md` with dev commands and the env file.
- **Patterns to follow:** `tiny-dash` root `nx.json`, `.github/workflows/ci.yml`.
- **Test expectation:** none -- tooling only; proven by CI passing on a generated placeholder lib.
- **Verification:** `nx affected` runs lint, typecheck, test and build on a sample lib in CI.

### U2. Database schema and migrations

- **Goal:** Postgres schema for every entity in the data model, with migrations and a client that works on both Postgres and PGlite.
- **Requirements:** R2, R3, R4, R5, R6, R10, R15, R16, R19, R20, R21, R23, R24; KTD4, KTD5, KTD11, KTD13.
- **Dependencies:** U1.
- **Files:** `libs/db/package.json`, `libs/db/drizzle.config.ts`, `libs/db/src/index.ts`, `libs/db/src/schema/*.ts`, `libs/db/src/client.ts`, `libs/db/src/migrate.ts`, `libs/db/migrations/`, `libs/db/src/testing.ts`, `libs/db/src/schema.test.ts`.
- **Approach:**
  1. Generate `libs/db` with `@nx/js:library` (workspace defaults already pass `linter: none` and vitest). Add `drizzle-orm`, `pg`, `@electric-sql/pglite` and `drizzle-kit` (dev).
  2. One schema file per area (users, catalog, recipes, sharing, planning, shopping, history, profile); `users.id` is the WorkOS user ID as `text`; other IDs are `uuid` with `gen_random_uuid()` defaults.
  3. Every owned table has `user_id` (FK to `users`, cascade on user delete) and an index leading with it. Every parent that a child references also carries `unique (user_id, id)`, and child references (recipe line → ingredient, plan entry → recipe, cook event → plan entry, ingredient children → ingredient, recipe children → recipe, week children → week plan) are composite `(user_id, <parent>_id) → (user_id, id)` foreign keys (KTD4).
  4. Unique constraints: ingredient name per user (case-insensitive, on `lower(name)`), alias per ingredient, conversion unit per ingredient, one week plan per `(user_id, week_key)`, one taste profile per user, share token globally, one list item state per `(week_plan_id, ingredient_id)`, one snapshot per week plan.
  5. Delete behavior: recipe children (lines, steps, tags, share links) cascade with the recipe. `plan_entries → recipes` uses `on delete no action` (checked at statement end, unlike `restrict`, so a user-delete cascade still succeeds) and recipes carry a nullable `archived_at`; deciding when to archive instead of delete is U4's domain rule, the schema only guarantees a planned recipe cannot be hard-deleted. Recipe lines → ingredients is also `no action`, so an ingredient in use cannot vanish. Cook events → plan entries is `no action` as well, so cooked history (R20) cannot be deleted with its entry; U5's set-entries updates existing entries in place rather than deleting and re-inserting cooked ones. Imported recipes record their origin in nullable `imported_from_user_id` / `imported_from_recipe_id` without a FK, since the source may later be deleted.
  6. Amounts are `numeric` (entered amount, entered unit, canonical amount); week snapshots store their evaluation as `jsonb` (KTD13).
  7. `client.ts` exports a factory over `node-postgres` and a PGlite variant with one shared `Database` type. `migrate.ts` takes `pg_advisory_lock` on a dedicated connection, runs the Drizzle migrator from `libs/db/migrations`, and releases the lock in `finally` (KTD5).
  8. `testing.ts` creates a fresh in-memory PGlite instance, applies the committed migrations and returns the Drizzle client, for use by every test suite (KTD11).
  9. `drizzle.config.ts` points `drizzle-kit` at the schema folder and `migrations/`; a `db-generate` target wraps `drizzle-kit generate`, and the first migration is generated from the schema, never hand-written.
- **Test scenarios:**
  - Migrations apply cleanly to an empty PGlite database, and running them a second time is a no-op.
  - Inserting two ingredients with the same name (differing only in case) for one user fails; the same name for two users succeeds.
  - Creating a second week plan for the same user and week fails.
  - Creating a second taste profile for one user fails; a share token reused across users fails.
  - Deleting a recipe removes its lines, steps, tags and share links.
  - A recipe line for user A pointing at user B's ingredient violates the composite foreign key; so does a plan entry for user A pointing at user B's recipe.
  - Deleting a recipe referenced by a plan entry is refused by the foreign key; setting `archived_at` on it succeeds and the plan entry and its cook events still resolve the recipe.
  - Deleting a plan entry that has a cook event is refused by the foreign key.
  - Deleting a user cascades away all of their rows.
- **Verification:** Schema tests pass on PGlite via `pnpm nx run db:test`; running `pnpm nx run db:db-generate` after the committed migrations reports no schema changes and leaves `git status` clean.

### U3. Units library

- **Goal:** A pure `libs/units` package (`@simmery/units`) that every amount in the system goes through: unit lookup, normalization into an ingredient's canonical unit, and least-waste pack fit.
- **Requirements:** R4, R5, R6, R13, AE1, AE2, AE3; KTD6, KTD7.
- **Dependencies:** U1. No database; it does not wait for U2.
- **Files:** `libs/units/src/index.ts`, `libs/units/src/lib/units.ts`, `libs/units/src/lib/normalize.ts`, `libs/units/src/lib/pack-fit.ts`, `libs/units/src/lib/units.spec.ts`, `libs/units/src/lib/normalize.spec.ts`, `libs/units/src/lib/pack-fit.spec.ts`, root `tsconfig.json` (project reference added by the generator).
- **Approach:**
  1. Scaffold with the `@nx/js:library` generator (`--linter=none`, Vitest), mirroring `libs/placeholder` (source under `src/lib/`, `*.spec.ts`, `simmery` export condition).
  2. Unit registry: each known unit has a code, a dimension and accepted spellings, matched case-insensitively after trimming. Mass: `mg`, `g`, `kg`. Volume: `ml`, `cl`, `dl`, `l`, `tsp` (5 ml), `tbsp` (15 ml). Count-like: `piece`, `clove`, `pinch`, `bunch`, `slice`, `sprig`, `can`; each count-like unit is its own dimension, so no built-in factor links two of them. Spellings cover singular, plural and full names (`grams`, `litre`, `teaspoon`). Ambiguous units (`cup`, `oz`, `fl oz`, `lb`) are not built in; a user can still add them as per-ingredient conversions.
  3. Unknown unit strings are allowed. They are compared trimmed and lowercased, and only normalize through an explicit ingredient conversion for that unit (e.g. `handful`), never through the registry.
  4. `normalize(amount, unit, ingredient)` takes the ingredient's canonical unit and its conversions (`unit`, `factor`, where 1 `unit` = `factor` canonical units; "1 clove ≈ 5 g" on a `clove` ingredient is stored as `g` → 0.2). It returns either a canonical amount or an unresolved result naming the unit. Resolution order follows the High-Level Technical Design flowchart (KTD6): same unit, then a direct ingredient conversion, then one built-in same-dimension hop into the canonical unit, else unresolved. Nothing crosses dimensions without an ingredient conversion. Chaining a built-in hop into a conversion's unit (`1 kg` garlic through a `g` conversion) was considered and not built: KTD6 does not allow it, and the line is flagged at entry so the user adds the conversion; revisit if such flags turn out to be common.
  5. Results are rounded to 6 decimal places so factor arithmetic (`50 × 0.2`) yields exact-looking amounts. Negative, NaN or infinite amounts throw a `RangeError`; adapters validate input first, so reaching it is a programming error.
  6. `packFit(needed, packSizes)` follows KTD7: least excess, then fewest packs, then larger packs. With no pack sizes it returns no estimate (R13, AE3). It returns the chosen packs with counts, the purchased total and the leftover. Search: round the needed amount and pack sizes to 6 decimals and scale by a fixed 1e6; reduce only the pack sizes by their greatest common divisor `g` (the needed amount stays out of the gcd, since scaled week totals are often fractional); find the smallest reachable sum ≥ `ceil(scaledNeeded / g)` with an unbounded-knapsack min-count table up to that target plus the largest reduced pack; compute the leftover in real units. The state budget (about 1e6) is checked from the reduced target before allocating; above it, the search retries on coarser grids (1/1000 of a unit, then whole units, with pack sizes rounded down and the need rounded up so the result still covers the need), and only when even whole units exceed the budget does packFit fall back to the best single-size combination, so an absurd amount from an agent cannot stall `evaluate_week`.
- **Execution note:** Implement test-first; it is pure and every downstream number depends on it.
- **Patterns to follow:** `libs/placeholder` for project layout, package exports and the Vitest config.
- **Test scenarios:**
  - Registry: `G`, ` grams ` and `gram` all resolve to `g`; `teaspoon` resolves to `tsp`; `cup` is unknown.
  - Registry: `clove` and `piece` have different dimensions.
  - `normalize(500, g, flour[canonical g])` returns 500.
  - `normalize(1, kg, flour[canonical g])` returns 1000 via the built-in table.
  - `normalize(2, tbsp, oil[canonical ml])` returns 30.
  - `normalize(250, ml, milk[canonical l])` returns 0.25.
  - Covers AE1. `normalize(50, g, garlic[canonical clove, no conversion])` is unresolved and names `g`; with conversion `g` → 0.2 it returns 10.
  - `normalize(1, kg, garlic[canonical clove, conversion g → 0.2])` is unresolved (no chained hop).
  - `normalize(1, piece, flour[canonical g])` with no conversion is unresolved (no cross-dimension guessing).
  - `normalize(2, Handful, spinach[canonical g, conversion handful → 30])` returns 60; `normalize(2, handful, spinach[canonical g])` is unresolved.
  - `normalize(0, g, flour[canonical g])` returns 0; `normalize(-1, g, …)` and `normalize(NaN, g, …)` throw.
  - Covers AE2. Pack fit: need 350, packs [200, 500] → two 200, purchased 400, leftover 50.
  - Pack fit: need 400, packs [200, 500] → two 200, leftover 0.
  - Pack fit: need 400, packs [200, 400] → one 400 (fewest packs breaks the tie).
  - Pack fit: need 0 → no packs, leftover 0.
  - Covers AE3. Pack fit with no pack sizes → no estimate.
  - Pack fit: need 1.5, packs [0.5, 1] (e.g. kg) → leftover 0, two packs.
  - Pack fit: need 66.666667, packs [200, 500] → one 200 through the table, not the fallback.
  - Pack fit: need 650.000001, packs [200, 500] → purchased 700 (200 + 500).
  - Pack fit: need 1e12, packs [7, 13] completes quickly through the fallback with a valid, non-negative leftover.
- **Verification:** `units` lint, typecheck, test and build pass; the package exports the registry lookup, `normalize` and `packFit` for U4, U5 and U12.

### U12. Catalog domain

- **Goal:** User-scoped ingredient catalog operations that recipes, planning and both adapters build on.
- **Requirements:** R2, R3, R4, R5, R9; KTD2, KTD4, KTD6.
- **Dependencies:** U2 (schema, PGlite testing helper), U3.
- **Files:** `libs/domain/src/catalog.ts`, `libs/domain/src/catalog.test.ts`.
- **Approach:**
  1. Scaffold `libs/domain` if U2 has not (same generator settings as U3).
  2. List/search by name and aliases, case-insensitive, scoped to the caller.
  3. Create and update an ingredient (name, aliases, canonical unit, pack sizes, conversions). Canonical and conversion units accept any non-empty string: a known spelling is stored as its registry code (`grams` → `g`), any other string trimmed and lowercased, matching how `normalize` compares units. A conversion for the canonical unit itself, and non-positive factors or pack sizes, are rejected.
  4. Changing an ingredient's canonical unit is refused while recipe lines reference it (it would silently invalidate stored amounts).
  5. An ingredient ID owned by another user is treated as not found (KTD4).
- **Test scenarios:**
  - Catalog search finds "spring onion" by alias "scallion", and by "SPRING".
  - Creating a second "Flour" for the same user fails with a duplicate-name error; another user can create "Flour".
  - Catalog calls for user A never return user B's ingredients; updating user B's ingredient as user A is not found.
  - Changing the canonical unit of an ingredient used by a recipe line is rejected; an unused ingredient's canonical unit can change.
  - Adding a conversion with factor 0 or for the canonical unit is rejected.
  - A `handful` conversion is accepted; a `Grams` conversion is stored as `g`.
- **Verification:** Catalog tests pass on PGlite.

### U4. Recipes domain

- **Goal:** Create, edit, read and delete recipes with normalized ingredient lines.
- **Requirements:** R6, R7, R8, R9; KTD2, KTD6.
- **Dependencies:** U3, U12.
- **Files:** `libs/domain/src/recipes.ts`, `libs/domain/src/recipes.test.ts`.
- **Approach:** Save takes the full recipe (title, servings, lines, steps, tags, source URL) and replaces lines/steps/tags transactionally. Each line references an existing ingredient ID or a `newIngredient` payload created in the same transaction. Save fails with a structured per-line error list when any line is unresolved (R6). Every referenced ingredient ID must belong to the caller (KTD4). The source URL must be absolute `http` or `https`; other schemes (`javascript:`, `data:`) are rejected, since recipes can come from untrusted pages and render on the public share view. Search filters by title substring and tag.
- **Test scenarios:**
  - Saving a recipe with three resolvable lines stores both entered and canonical amounts.
  - Saving with one unresolved line fails, stores nothing, and the error names that line index and unit.
  - Saving with a `newIngredient` creates it in the user's catalog and links the line.
  - Editing a recipe replaces its steps in the new order.
  - User B cannot read, edit or delete user A's recipe (not found, not forbidden, to avoid leaking existence).
  - Search by tag `vegetarian` returns only tagged recipes.
  - Saving a recipe for user A whose line references user B's ingredient ID fails as not found.
  - Saving with source URL `javascript:alert(1)` fails with a field error; an `https` URL is accepted.
- **Verification:** Recipe tests pass.

### U5. Planning and shopping domain

- **Goal:** Weekly plans, week evaluation and the aggregated shopping list.
- **Requirements:** R2, R10, R11, R12, R13, R14, R16, F1, AE2, AE3; KTD2, KTD4, KTD7, KTD8, KTD13.
- **Dependencies:** U4.
- **Files:** `libs/domain/src/planning.ts`, `libs/domain/src/evaluate-week.ts`, `libs/domain/src/shopping.ts`, `libs/domain/src/errors.ts`, `libs/domain/src/index.ts`, `libs/domain/src/evaluate-week.test.ts`, `libs/domain/src/planning.test.ts`, `libs/domain/src/shopping.test.ts`.
- **Approach:**
  1. **Week keys.** A key is `YYYY-Www` with a week that exists in that ISO year (W53 only in 53-week years); anything else is a field error. The week starts Monday 00:00 UTC and has ended from the following Monday 00:00 UTC. The domain has no user time zone, so UTC stands in for the browser's zone (Assumptions); callers pass `now` so tests control the clock.
  2. **`getWeek(weekKey)`** gets or creates the caller's week (insert, ignore the unique conflict, select) and returns its entries (entry ID, recipe ID and title, servings, day) plus the evaluation of the saved entries.
  3. **`setWeekEntries(weekKey, entries)`** replaces the week's entry set in one transaction. An input entry with an `id` updates that entry's servings and day in place and keeps its recipe (a different recipe ID is a field error); one without an `id` is inserted. Saved entries missing from the input are deleted, except an entry with cook events, which refuses the whole save with `ConflictError('entry_cooked')` so cooked history (R20) is never lost; the cook-event FK is `no action` (U2). Servings must be a positive whole number and day 1–7 or absent. Every recipe ID must be the caller's (KTD4, not found otherwise), and a new entry may not use an archived recipe (field error); existing entries of a since-archived recipe stay.
  4. **`evaluateWeek(entries, recipes, ingredients)`** in `evaluate-week.ts` is pure: each entry contributes every line's canonical amount × planned servings ÷ recipe servings. It returns one line per ingredient (ingredient ID, name, canonical unit, total rounded via `roundAmount`, number of entries using it, leftover from `packFit` or `null` without pack sizes), the overlap (lines used by two or more entries), and tag counts (entries per tag). Lines sort by ingredient name. A shared loader reads the caller's recipes and their ingredients' pack sizes and calls it, writing nothing; any recipe ID that is not the caller's is not found before any ingredient data is read. `evaluateCandidateWeek(db, userId, entries)` uses it for unsaved candidates and rejects archived recipes with the same field error as a new entry; `getWeek`, the shopping list and snapshots use it for saved entries, archived recipes included, so web and MCP share one evaluation (KTD2).
  5. **`getShoppingList(weekKey)`** returns the evaluation's ingredient lines with their totals and checked state (no leftovers or packs, AE2), plus the extras in creation order.
  6. **`applyListOps(weekKey, ops)`** takes operations, each with a client timestamp: `check` (ingredient ID, checked), `addExtra` (client-generated UUID, text), `renameExtra`, `checkExtra`, `removeExtra`. Ops apply in one transaction in client-timestamp order. Client timestamps later than the server's `now` are capped at `now`, so one device with a fast clock cannot lock an item. Each item keeps the timestamp of the write that set it, and an op applies only when strictly newer, so arrival order does not matter (KTD8); this is a conditional upsert on `list_item_states` and `list_extras`. A `check` for an ingredient not on the current list, and an extra op for an ID not in this week, are ignored; an extra ID already used elsewhere is ignored rather than overwritten. `addExtra` on an existing ID is an idempotent upsert so a replay is harmless. Extras belong to the week, not to entries, so they survive plan changes. A removed extra is deleted outright; an add for it replayed out of order from a second device would bring it back, which is accepted because an extra can only be removed after its add has synced. It returns the resulting list.
  7. **Snapshots (KTD13).** A snapshot is the week's evaluation inserted into `week_snapshots` with `on conflict do nothing`, so exactly one exists and is never overwritten. The first `applyListOps` call that applies a `check` or `checkExtra` writes it. An exported `snapshotEndedWeeks(db, userId, now)` writes it for every one of the caller's ended weeks that has entries and no snapshot; `getWeek` and `getShoppingList` call it, and U6 statistics call it before reading trends, so a week nobody reopens is still frozen. A week without entries is never snapshotted, so opening an empty past week cannot freeze an empty evaluation.
  8. Extend `NotFoundError` entities with `plan_entry` and `ConflictReason` with `entry_cooked`; export the new operations and types from `index.ts`.
- **Patterns to follow:** `libs/domain/src/recipes.ts` for input preparation, `throwIfIssues`, `isUuid` guards and transactional replace; `loadIngredients` in `catalog.ts` for owned loading; `libs/domain/src/recipes.test.ts` for PGlite setup with two users.
- **Test scenarios:**
  - Recipe A (serves 2, 1 onion) planned for 4 servings plus recipe B (serves 2, 2 onions) planned for 2 produce one onion line of 4 pieces, listed in overlap.
  - A recipe with servings 2 planned for 4 doubles all amounts; tags count once per entry.
  - Covers AE2. Cream 350 ml needed, packs [200, 500] → evaluation shows leftover 50 ml; the list line shows 350 ml with no pack suggestion.
  - Covers AE3. Coriander with no pack sizes shows the summed amount and a `null` leftover, in evaluation and on the list.
  - `evaluateCandidateWeek` on an unsaved candidate leaves the stored week and its entries unchanged.
  - Overlap lists only ingredients used by two or more entries.
  - `getWeek` on a new key creates the week once; a second call returns the same week. `2026-W54`, `2026-W00` and `2026-44` are field errors; `2026-W53` is accepted.
  - `setWeekEntries` keeps entry IDs it was given, updates their servings and day, inserts new entries and deletes omitted ones; omitting an entry with a cook event is refused and changes nothing.
  - A new entry with an archived recipe is a field error.
  - The list returns each line's ingredient ID, and a `check` op with that ID checks the line.
  - Two ops on the same item: the later client timestamp wins regardless of arrival order; an op with the same timestamp as the stored state does not change it.
  - An op for an item no longer on the list (recipe removed) is ignored without error.
  - Extras are added, renamed, checked and removed through ops, and survive a plan change; replaying an `addExtra` does not duplicate it.
  - The first check-off of a week writes exactly one snapshot; later ops do not overwrite it. `snapshotEndedWeeks` snapshots an ended week that was never checked off, skips an ended week with no entries and a current week, and leaves existing snapshots unchanged.
  - `evaluateCandidateWeek` with an archived recipe is a field error; `getWeek` still evaluates a saved entry whose recipe was archived later.
  - An op stamped in the future is applied as of `now`, so a later real op from another device still wins.
  - Setting or evaluating a week for user A with user B's recipe ID fails as not found and returns none of B's ingredients; user B cannot read or change user A's list, and an op naming one of A's extras from B is ignored.
- **Verification:** Planning and shopping tests pass on PGlite; `domain` lint, typecheck, test and build pass.

### U6. Cooking, statistics, taste profile and sharing domain

- **Goal:** The remaining domain areas: cook events, ratings, statistics, taste profile, share links and import.
- **Requirements:** R2, R6, R18, R19, R20, R21, R22, R23, R24, F2, F4, AE5; KTD2, KTD4, KTD13.
- **Dependencies:** U5.
- **Files:** `libs/domain/src/cooking.ts`, `libs/domain/src/stats.ts`, `libs/domain/src/profile.ts`, `libs/domain/src/sharing.ts`, `libs/domain/src/recipes.ts`, `libs/domain/src/errors.ts`, `libs/domain/src/index.ts`, `libs/domain/src/cooking.test.ts`, `libs/domain/src/stats.test.ts`, `libs/domain/src/profile.test.ts`, `libs/domain/src/sharing.test.ts`, `libs/domain/src/recipes.test.ts`. No schema change: `cook_events`, `week_snapshots`, `taste_profiles` and `share_links` exist since U2.
- **Approach:**
  1. **Scaling.** A pure `scaleRecipe(recipe, servings)` returns the recipe with every line's `amount` and `canonicalAmount` multiplied by servings ÷ recipe servings and rounded with `roundAmount`; servings must be a positive whole number. The web app can use it for any recipe view; the cook view uses it for an entry.
  2. **`getCookView(planEntryId)`** loads the caller's entry (week key, servings, day), the recipe through `getRecipe` scaled to the entry's servings, and the entry's cook events (ID, cooked at, rating) oldest first. An archived recipe still has a cook view, because existing entries keep their recipe (U5).
  3. **`markCooked(planEntryId, { rating? }, now)`** inserts a cook event at `now` and returns it. `rating` is a whole number 1–5 or absent; anything else is a field error. An entry may be cooked more than once; each call is a new event. **`rateCookEvent(cookEventId, rating | null)`** sets or clears a rating later, so the agent can ask "how was it?" the next day (F1, F2). **`deleteCookEvent(cookEventId)`** undoes a mistaken mark; without it a stray tap would block removing the entry for good (`entry_cooked`, U5).
  4. **`getStatistics(now)`** first calls `snapshotEndedWeeks(db, userId, now)` (KTD13), then returns:
     - `recipes`: every non-archived recipe, plus archived recipes that have cook events, with cook count, last cooked at (or null) and average rating (or null). Ordered by last cooked, newest first, never-cooked last. Aggregated live from `cook_events` joined through `plan_entries`.
     - `notCookedRecently`: the non-archived recipes from `recipes` never cooked or last cooked more than 4 weeks before `now`, oldest first.
     - `cooks`: every cook event (event ID, entry ID, recipe ID and title, cooked at, rating or null), oldest first; ratings over time are the events with a rating.
     - `weeks`: one row per week of the caller that has entries and starts within the last 12 ISO weeks up to the current week (future weeks excluded), ordered by week key. Each row has the week key, `frozen` and the evaluation (lines with totals and leftovers, overlap, tag counts). A week with a snapshot reads it (`frozen: true`); a week without one (the current week before its first check-off) is evaluated live through `evaluateSavedWeek`.
     - `mostBought`: across those week rows, per ingredient and unit, the number of weeks it appears in and the summed total, top 10 by week count then total. Names and units come from the rows, so a renamed ingredient keeps its snapshot name for frozen weeks.
     A user with no recipes, entries or events gets empty arrays. The 4- and 12-week spans are module constants; no caller needs to tune them yet.
  5. **Taste profile.** `getTasteProfile()` returns `{ body, updatedAt }`, with `''` and `null` when the user has no row. `updateTasteProfile(body)` upserts the whole text and returns the result; the body is stored as given, since markdown whitespace can matter.
  6. **Share links.** `createShareLink(recipeId)` returns the recipe's active link if one exists, otherwise creates one with a token of 32 random bytes (`crypto.randomBytes`, base64url); an archived recipe is a field error. `listShareLinks(recipeId)` returns the active links (ID, token, created at). `revokeShareLink(linkId)` sets `revoked_at` once (repeat calls keep the first time). Recipe and link IDs are the caller's or not found (KTD4).
  7. **`resolveShareToken(token)`** takes no user. It finds the link by token and reads the owner's recipe through `getRecipe` with the link's `user_id`, returning a `SharedRecipe` view: title, servings, source URL, lines (ingredient name, amount, unit, note, in order; no IDs), steps and tags. An unknown token is `NotFoundError('share_link')`; a revoked link throws a new `NoLongerSharedError` (AE5), which U7 maps to the "no longer shared" page.
  8. **`importSharedRecipe(token, { lines })`** resolves the token as above, then builds a `RecipeInput` from the shared recipe: same title, servings, steps, tags and source URL, and one line per source line from the mapping at the same index. A mapping is `{ ingredientId }` or `{ newIngredient }` (as in `RecipeLineInput`), with optional `amount` and `unit` overriding the source line's, so the importer can resolve a unit flag by converting the amount; adding a conversion goes through the catalog or the new ingredient's conversions. A mapping list whose length differs from the source lines is a field error. The save runs through the same path as `createRecipe` (validation, ingredient ownership, `normalize`), so a foreign ingredient ID is not found and an unresolved unit raises `UnresolvedUnitsError` with the source line index (R6). The copy is a new recipe of the importer with `imported_from_user_id` and `imported_from_recipe_id` set; it shares no rows with the original.
  9. **Recipe changes.** Extract the insert part of `createRecipe` into an internal `insertRecipe(db, userId, input, importedFrom?)` that `importSharedRecipe` reuses. `Recipe` gains `imported: boolean`; `updateRecipe` leaves provenance unchanged. This replaces the earlier "sharer display name" wording: `users` holds only the WorkOS ID and email, so the copy records the sharer's user ID and recipe in its row (R24), but the read model never returns them, and no layer looks up another user's email for display (R2). Showing a sharer name needs a name the sharer chose and is deferred. `deleteRecipe` also revokes the recipe's active share links in the same transaction, so deleting ends sharing and a later `restoreRecipe` does not bring old links back.
  10. Extend `NotFoundError` entities with `cook_event` and `share_link`, add `NoLongerSharedError` to `errors.ts`, and export the new operations and types from `index.ts`. Every operation that takes a caller follows the existing `(db, userId, …)` signature and checks IDs with `isUuid` before querying.
- **Patterns to follow:** `libs/domain/src/planning.ts` for `now` parameters, owned loading and conflict handling; `libs/domain/src/recipes.ts` for `throwIfIssues` and the transactional save; `libs/domain/src/planning.test.ts` for PGlite setup with two users and inserting cook events and snapshots directly.
- **Test scenarios:**
  - `scaleRecipe` of a 2-serving recipe to 3 servings scales both amount and canonical amount by 1.5, rounded; servings 0 is a field error.
  - The cook view of an entry planned for 4 servings of a 2-serving recipe shows doubled amounts and the steps in order; an archived recipe's entry still has a cook view.
  - Covers R19. Marking an entry cooked with rating 4 shows up in `cooks` with its rating and as that recipe's cook count and average; marking without a rating adds a cook but no rating; rating 0, 6 or 2.5 is a field error.
  - `rateCookEvent` later sets and then clears a rating; `deleteCookEvent` removes the event, after which `setWeekEntries` can drop the entry again.
  - Stats for a user with no events return empty collections, not errors.
  - "Not cooked recently" includes a recipe last cooked 6 weeks ago and a never-cooked recipe, and excludes one cooked last week and archived recipes.
  - Editing a recipe or an ingredient's pack sizes after its week was snapshotted leaves that week's leftover and most-bought figures unchanged.
  - A week with no snapshot yet (still current) shows live figures with `frozen: false`; an ended week never opened since gets snapshotted by `getStatistics` and shows `frozen: true`; a future week and a week outside the window are left out.
  - `mostBought` ranks an ingredient bought in three weeks above one bought in a single larger week.
  - Updating the taste profile replaces the text; reading a profile that was never written returns `''`; a second user's profile is untouched.
  - Creating a link twice returns the same active link; after revoking, a new create returns a new token; sharing an archived recipe is a field error.
  - Resolving a valid token returns the recipe without user context and with no ingredient or user IDs; an unknown or malformed token is not found.
  - Covers AE5. After revoke, resolving the token throws `NoLongerSharedError`; an already imported copy still exists unchanged. Deleting the shared recipe has the same effect, and the token stays no longer shared after `restoreRecipe`.
  - Covers R6. Import mapping a line to an ingredient with a different canonical unit and no conversion raises `UnresolvedUnitsError` naming that source line index; the same import with an `amount`/`unit` override in the canonical unit succeeds.
  - Import into user B creates the recipe under B with `imported: true`, the provenance columns set and no user ID of A in the returned recipe, and B's ingredients (existing and new); edits to A's original do not change B's copy; a mapping list of the wrong length is a field error.
  - Import by user B with a mapping that points at user A's ingredient ID fails as not found and creates nothing.
  - Cross-user: user B cannot read A's cook view, mark or rate A's entries or events, read A's statistics or profile, list, create or revoke links on A's recipe, delete A's cook event by ID or revoke A's link by ID; each fails as not found or returns only B's data, and A's rows are unchanged.
- **Verification:** All domain tests pass on PGlite; every new domain module has a cross-user isolation test; `domain` lint, typecheck, test and build pass.

### U7. Server, auth and JSON API

- **Goal:** The Hono server with WorkOS sign-in, local provisioning of the users WorkOS authenticates (invites are enforced upstream in WorkOS) and the typed `/api` surface over the domain.
- **Requirements:** R1, R2, R7, R9–R16, R18–R21, R23, R24 (web side), AE5 (web side), AE6 (web side); KTD1, KTD3, KTD4, KTD5, KTD11, KTD12.
- **Dependencies:** U6.
- **Files:** `apps/server/package.json`, `apps/server/tsconfig*.json`, `apps/server/vitest.config.mts`, `apps/server/src/main.ts`, `apps/server/src/app.ts`, `apps/server/src/config.ts`, `apps/server/src/errors.ts`, `apps/server/src/logger.ts`, `apps/server/src/static.ts`, `apps/server/src/auth/session.ts`, `apps/server/src/auth/workos.ts`, `apps/server/src/auth/routes.ts`, `apps/server/src/auth/middleware.ts`, `apps/server/src/routes/{ingredients,recipes,weeks,cooking,stats,profile,sharing,me}.ts`, `apps/server/src/testing.ts`, `apps/server/src/app.test.ts`, `apps/server/src/config.test.ts`, `apps/server/src/auth/*.test.ts`, `apps/server/src/routes/*.test.ts`, `libs/domain/src/users.ts`, `libs/domain/src/users.test.ts`, `libs/domain/src/index.ts`, `.env.example`, root `tsconfig.json` (reference). Bearer-token verification (`apps/server/src/auth/jwt.ts`) moves to U8, the only consumer of access tokens.
- **Approach:**
  1. **Project.** Scaffold `apps/server` (package `@simmery/server`) with an Nx generator, checking `--help` for flags first (`@nx/node:application` after adding `@nx/node@24.0.1`, or `@nx/js:library` if the node generator cannot do `--linter=none` with Vitest). It follows the TS solution setup like `libs/domain`: ESM, `tsc` build to `dist/`, inferred `build`/`typecheck`/`lint`/`test`, a `vitest.config.mts` copied from `libs/domain` (including `hookTimeout: 30_000`), and a `dev` target running `tsx watch --conditions=simmery --env-file=.env src/main.ts` (plain Node cannot map the workspace's `.js` specifiers to `.ts` sources or pick the `simmery` export condition). Dependencies, pinned exactly: `hono`, `@hono/node-server`, `@hono/zod-validator`, `zod` (v4), `@workos-inc/node` (v12, needs Node ≥ 22.11), `pino`, `tsx` (dev), plus `@simmery/db` and `@simmery/domain`.
  2. **Config.** `config.ts` exports `loadConfig(env)`, a zod schema over `DATABASE_URL`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD` (≥ 32 chars, iron-sealing requires it), `PUBLIC_BASE_URL` (absolute URL, no trailing slash; the AuthKit redirect URI is `${PUBLIC_BASE_URL}/auth/callback`), `PORT` (default 3000), `WEB_ROOT` (optional path to the built web app) and `LOG_LEVEL` (default `info`). On failure it throws one error naming every bad variable without echoing values. Every variable goes into `.env.example` with a comment.
  3. **App factory.** `createApp(deps)` in `app.ts` takes `{ db, auth, now, checkDatabase, webRoot?, logger, cookieSecure }` and builds the whole Hono app without touching `process.env`, so tests build it with PGlite and a fake auth. The `/api` sub-app is one chained Hono instance (`.route('/ingredients', ingredients)…`) so `export type AppType` carries every route for the Hono RPC client in U9. Routes take `now()` from deps where the domain accepts `now`. `main.ts` loads config, creates the `pg` pool, runs `migrate(pool)` from `@simmery/db` before listening (KTD5), builds the WorkOS client as `new WorkOS(WORKOS_API_KEY, { clientId: WORKOS_CLIENT_ID })` (session `authenticate()` and `refresh()` read the client ID from the instance and fail without it) and the adapter over it, serves with `@hono/node-server`, and on `SIGTERM`/`SIGINT` stops accepting connections and ends the pool.
  4. **Auth seam.** `auth/session.ts` defines the interface the app depends on, with no WorkOS types in it:
     - `authorizationUrl(state)` → hosted AuthKit login URL (`provider: 'authkit'`, redirect URI, state).
     - `signIn(code)` → `{ user: { id, email }, sealedSession }`.
     - `resume(sealedSession)` → `{ status: 'active', user }` | `{ status: 'refreshed', user, sealedSession }` | `{ status: 'signed_out' }` | `{ status: 'unavailable' }`.
     - `logoutUrl(sealedSession)` → WorkOS logout URL, or null when the session is unreadable.
     `auth/workos.ts` implements it over `@workos-inc/node`: `authenticateWithCode({ code, clientId, session: { sealSession: true, cookiePassword } })`; `loadSealedSession(...).authenticate()`, where `no_session_cookie_provided` and `invalid_session_cookie` (tampered, or sealed with a rotated password) are `signed_out`, and `invalid_jwt` (expired access token) triggers `refresh()`. A terminal refresh failure is `signed_out`; a `retryable` one (timeout, 5xx, 429), and any error `authenticate()` or `refresh()` throws (JWKS fetch failure, network error), is `unavailable`, so a WorkOS hiccup is a 503, not a logout or a 500.
     - **One refresh per expired cookie.** WorkOS rotates the refresh token on use, and the SPA sends several requests at once (page load, offline op replay), so parallel requests carrying the same expired cookie must not each call `refresh()`: the losers would fail terminally and log the user out. The adapter keeps in-flight refreshes keyed by the sealed value and remembers each old seal's result for 60 s, so every concurrent request gets the same new seal. This is in-process; one replica (U11) is enough for a small group, and more replicas would need sticky sessions or a shared cache.
     - **Logout with an expired token.** The SDK's `getLogoutUrl()` needs a valid access token to read the session ID, so `logoutUrl` refreshes first when `authenticate()` reports `invalid_jwt`, and returns null only when the cookie is unreadable or the refresh fails.
  5. **Auth routes.** `GET /auth/login?returnTo=` sets a short-lived `simmery_auth` cookie (HttpOnly, SameSite=Lax, 10 min) holding a random state and the return path, then redirects to AuthKit. `returnTo` is parsed with `new URL(returnTo, PUBLIC_BASE_URL)` and kept as pathname + search + hash only when the raw value has no control characters and the parsed origin equals `PUBLIC_BASE_URL`'s, otherwise `/` (a prefix check misses `/%09/evil.example`, which browsers read as `//evil.example`); this lets the share page send a visitor through sign-in and back to `/s/:token`. `GET /auth/callback` rejects a missing or mismatched state with 400, calls `signIn`, provisions the local user, sets the session cookie, clears the state cookie and redirects to the return path. `POST /auth/logout` clears the cookie and answers 303 to the WorkOS logout URL (or `/`). Invite gating lives in WorkOS (public sign-up disabled, KTD3): an uninvited person never gets a code, so the server trusts any user AuthKit authenticates.
  6. **Session cookie.** `simmery_session`, HttpOnly, SameSite=Lax, Path=/, Max-Age 30 days, rewritten on every refresh; `Secure` unless `PUBLIC_BASE_URL` is `http://localhost…`, so local dev over HTTP works. CSRF defence for cookie-authenticated writes is SameSite=Lax plus an origin check on `/api/*` and `/auth/logout`: every method other than GET, HEAD and OPTIONS is rejected with 403 `{ error: 'forbidden_origin' }` unless `Origin` equals the `PUBLIC_BASE_URL` origin, or, when `Origin` is absent, `Sec-Fetch-Site` is `same-origin`. Content type is no defence: Hono's JSON validator validates `{}` for a non-JSON body, and several writes have no body. No token scheme, no CORS.
  7. **Middleware and provisioning.** `auth/middleware.ts` guards `/api/*` except `GET /api/share/:token`: no cookie or `signed_out` → 401 `{ error: 'unauthenticated' }` (the cookie is left alone, so a late 401 can never overwrite a cookie a parallel request just refreshed; the next sign-in replaces it); `unavailable` → 503 `{ error: 'auth_unavailable' }`; `refreshed` → sets the new cookie. It then calls `ensureUser(db, { id, email })` and puts `userId` on the context. `ensureUser` lives in a new `libs/domain/src/users.ts` because U8 provisions from MCP tokens too (KTD2): one `insert … on conflict (id) do update set email = excluded.email where users.email is distinct from excluded.email`, so concurrent first requests create one row and an email change in WorkOS follows along.
  8. **Routes.** One file per area under `routes/`, each a thin adapter: zod-validate params, query and JSON body for shape only (types, presence), then call the domain with `c.var.userId`. Semantic checks (non-empty names, positive amounts, ISO week keys, rating range) stay in the domain so web and MCP agree (KTD2). Recipe and ingredient IDs are passed through as strings; the domain's `isUuid` check turns a malformed ID into not found.
     | Area | Routes → domain |
     |---|---|
     | me | `GET /api/me` → `{ id, email }` (the web app's session probe) |
     | ingredients | `GET /api/ingredients?query` → `listIngredients`; `POST` → `createIngredient`; `GET /:id` → `getIngredient`; `PUT /:id` → `updateIngredient` |
     | recipes | `GET /api/recipes?query&tag&archived` → `searchRecipes`; `POST` → `createRecipe`; `GET /:id?servings` → `getRecipe`, then `scaleRecipe` when `servings` is given; `PUT /:id` → `updateRecipe`; `DELETE /:id` → `deleteRecipe` (archive, 204); `POST /:id/restore` → `restoreRecipe` |
     | weeks | `GET /api/weeks/:weekKey` → `getWeek`; `PUT /api/weeks/:weekKey/entries` → `setWeekEntries`; `POST /api/weeks/evaluate` → `evaluateCandidateWeek`; `GET /api/weeks/:weekKey/shopping-list` → `getShoppingList`; `POST /api/weeks/:weekKey/shopping-list/ops` → `applyListOps` |
     | cooking | `GET /api/plan-entries/:id/cook-view` → `getCookView`; `POST /api/plan-entries/:id/cook-events` → `markCooked`; `PUT /api/cook-events/:id/rating` → `rateCookEvent`; `DELETE /api/cook-events/:id` → `deleteCookEvent` |
     | stats | `GET /api/statistics` → `getStatistics` |
     | profile | `GET /api/taste-profile` → `getTasteProfile`; `PUT /api/taste-profile` → `updateTasteProfile` |
     | sharing | `GET /api/recipes/:id/share-links` → `listShareLinks`; `POST /api/recipes/:id/share-links` → `createShareLink`; `DELETE /api/share-links/:id` → `revokeShareLink`; `GET /api/share/:token` (public) → `resolveShareToken`; `POST /api/share/:token/import` → `importSharedRecipe` |
  9. **Error mapping.** `errors.ts` holds one `app.onError` handler and the zod-validator hook, so every route answers the same shapes: zod failures and `ValidationError` → 400 `{ error: 'validation', issues: [{ field, message }] }` (zod paths rendered like the domain's, e.g. `lines[0].amount`); `NotFoundError` → 404 `{ error: 'not_found', entity }`; `ConflictError` → 409 `{ error: 'conflict', reason }`; `UnresolvedUnitsError` → 422 `{ error: 'unresolved_units', lines: [{ index, unit }] }`; `NoLongerSharedError` → 410 `{ error: 'no_longer_shared' }`; Hono's `HTTPException` 400 for a malformed JSON body → 400 `{ error: 'validation', issues: [{ field: '', message: 'malformed JSON' }] }`, other `HTTPException`s their own response; anything else → 500 `{ error: 'internal' }` and an error log. An unmatched `/api/*` path is a JSON 404, never the SPA shell.
  10. **Probes and logging.** `GET /healthz` is 200 while the process runs. `GET /readyz` runs `checkDatabase` (`select 1` with a 2 s timeout in production) and answers 200 or 503. `logger.ts` creates a pino JSON logger; a request logger records method, the matched route pattern (never the raw path, which can carry a share token), status and duration. No bodies, cookies, emails or recipe text are logged (KTD12). The 500 log records only the error class, the Postgres SQLSTATE when present and the stack frames, never `message`, `params`, `query`, `detail` or a cause message: drizzle's `DrizzleQueryError` message embeds the query parameters (emails, recipe and profile text). The same rule reaches traces: U11 configures the auto-instrumentation to redact the token segment of `/api/share/*` and `/s/*` and drop the query string of `/auth/callback` before export.
  11. **Static hosting.** `static.ts` serves `WEB_ROOT` with `serveStatic` when it is set: `/assets/*` with a long immutable cache, other files as-is, and every other `GET` that is not `/api`, `/auth`, `/mcp`, `/.well-known`, `/healthz` or `/readyz` falls back to `index.html` with `Cache-Control: no-cache` (this is how `/s/:token` reaches the SPA). Without `WEB_ROOT` (before U9 builds the web app) non-API paths are 404.
- **Patterns to follow:** `libs/domain/src/sharing.test.ts` for PGlite setup with two users through `createTestDatabase`; `libs/domain/vitest.config.mts` for the test config; `libs/domain/src/errors.ts` for the error classes being mapped; `libs/db/src/migrate.ts` for the startup migration. Hono's `app.request()` drives tests in-process, no port.
- **Test scenarios:**
  - Request to `/api/recipes` without a cookie returns 401; with a cookie the fake reports `signed_out`, 401 without a `Set-Cookie`; with `unavailable`, 503.
  - A `POST /api/recipes/:id/restore` with a valid session and `Origin: https://evil.example`, or a form-encoded body and no `Origin` and `Sec-Fetch-Site: cross-site`, returns 403 and leaves the recipe archived; the same request from the public origin succeeds.
  - A malformed JSON body returns 400 `validation`, not 500; a domain call throwing a database error carrying an email parameter returns 500 and the captured log line holds neither the email nor the SQL.
  - A `refreshed` session answers the request and sets the new sealed cookie.
  - Covers AE6 (web side). With a session for user A, `GET /api/recipes/:idOfB`, `PUT /api/ingredients/:idOfB`, `GET /api/plan-entries/:entryOfB/cook-view` and `DELETE /api/share-links/:linkOfB` return 404, and B's rows are unchanged; `GET /api/recipes` lists only A's recipes.
  - First authenticated request for a new WorkOS user creates exactly one local user; a second request reuses it; two concurrent first requests still create one row; a changed email is updated.
  - Invalid recipe payload (missing `title`, `servings` as a string) returns 400 with field paths; a domain rule (empty step) returns 400 in the same shape; unresolved units return 422 with the line index and unit; a duplicate ingredient name returns 409 `duplicate_name`.
  - A malformed or non-UUID ID returns 404, not 500; a bad week key returns 400.
  - Weeks: setting entries, then reading the shopping list and posting a check-off op round-trips; `POST /api/weeks/evaluate` returns overlap without changing the stored week.
  - Cooking: marking an entry cooked with rating 4, re-rating and deleting the event each return the expected status; stats then reflect the cook.
  - Covers AE5 (web side). `GET /api/share/:token` works without a session and returns no IDs; a revoked token returns 410; an unknown token 404; `POST /api/share/:token/import` without a session returns 401 and with one creates the copy for the caller.
  - `GET /s/:token` and `/some/deep/link` return the SPA shell from a temp `WEB_ROOT`; `/assets/app.js` is served with the immutable cache header; `/api/nope` returns JSON 404.
  - `/healthz` returns 200; `/readyz` returns 200, and 503 when `checkDatabase` rejects.
  - Auth routes: `/auth/login` redirects to the fake authorization URL and sets the state cookie; the callback with a mismatched state returns 400 and creates no user; with the right state it sets the session cookie and redirects to a same-origin `returnTo`, and to `/` for `//evil.example`, `/%09/evil.example`, `/\evil.example` and `https://evil.example`; logout clears the cookie and redirects 303.
  - WorkOS adapter (`auth/workos.test.ts`, over a fake `userManagement` object): an expired access token triggers refresh and returns `refreshed`; a terminal refresh failure maps to `signed_out`, a retryable one and a thrown network error to `unavailable`; an unreadable cookie is `signed_out`; three parallel `resume` calls with one expired seal make exactly one `refresh()` and all return the same new seal; `logoutUrl` with an expired access token still returns the WorkOS logout URL.
  - `loadConfig` names every missing variable, rejects a short cookie password and does not echo secret values.
- **Execution note:** Stub WorkOS behind the `session.ts` interface so tests inject a fake (`testing.ts` exports a fake whose cookie value names the user) and never call WorkOS. Route tests seed through domain functions, not raw inserts, where a domain function exists.
- **Verification:** `server` lint, typecheck, test and build pass, and `domain` tests pass with `ensureUser`. Manual check against a WorkOS staging environment, recorded in the PR: a local run signs in an invited user, `GET /api/me` returns them, and an uninvited email cannot sign up. If no staging environment is set up when U7 lands, the PR says so and the check moves to U8, which needs the same environment; it must pass no later than the U11 live rollout, whose verification repeats it against production.

### U8. MCP endpoint

- **Goal:** A remote MCP server any MCP client can connect to with OAuth, acting only as the signed-in user.
- **Requirements:** R8, R22, R25, R26, R27, F1, F3, AE6; KTD3, KTD10.
- **Dependencies:** U7.
- **Files:** `apps/server/src/auth/jwt.ts`, `apps/server/src/mcp/server.ts`, `apps/server/src/mcp/tools/*.ts`, `apps/server/src/mcp/metadata.ts`, `apps/server/src/mcp/mcp.test.ts`.
- **Approach:**
  1. Serve `/.well-known/oauth-protected-resource` naming AuthKit as authorization server and the `/mcp` URL as resource.
  2. Verify bearer JWTs (issuer, audience/resource, expiry) via JWKS before the MCP handler; 401 with `WWW-Authenticate` pointing at the metadata on failure Provision the local user through `ensureUser` (U7); if AuthKit access tokens carry no email claim, read it once from the WorkOS user API.
  3. Mount the MCP app with Host/Origin validation set for the public hostname from `config.ts` (the adapter defaults to localhost-only and would reject ingress traffic).
  4. Build the MCP server per request from `authInfo` with the tool set in the MCP tool surface table under High-Level Technical Design; tool descriptions explain units, pack sizes and the unit-flag retry loop so agents can resolve R6 flags themselves.
  5. `save_recipe` returns the per-line flags as a structured tool error rather than throwing.
- **Patterns to follow:** MCP SDK v2 serving guide (Hono adapter, `requireBearerAuth`); AGENTS.md rule on one domain layer.
- **Test scenarios:**
  - `/mcp` without a token returns 401 with a `WWW-Authenticate` header referencing the protected-resource metadata URL.
  - A token with the wrong audience is rejected.
  - With user A's token, `list_tools` returns the documented tool set.
  - Covers AE6. With user A's token, `get_recipe` for user B's recipe ID returns not found.
  - `save_recipe` with an unresolved unit returns the flag list; after `upsert_ingredient` adds the conversion, the same call succeeds (F3).
  - `evaluate_week` returns overlap and leftovers without changing the stored week; `set_week_entries` then persists it (F1).
  - `update_taste_profile` followed by `get_taste_profile` returns the new text.
  - A request carrying the configured public Host header reaches the MCP handler; an unknown Host is rejected.
- **Execution note:** Check first, against a WorkOS staging environment, that AuthKit access tokens carry the MCP URL as audience/resource; if they do not, stop per the Goal Capsule.
- **Verification:** MCP tests pass using the SDK client against the in-process app; a manual connection from Claude Code to the locally running server (WorkOS staging environment) lists tools and reads recipes. The claude.ai remote-connector check happens in U11 after rollout.

### U9. Web app: recipes, catalog, planning, cooking, stats, profile, sharing

- **Goal:** The mobile-first website for everything except offline shopping.
- **Requirements:** R7, R9, R12, R18, R19, R20, R21, R23, R24, F2, F4.
- **Dependencies:** U7.
- **Files:** `apps/web/src/main.tsx`, `apps/web/src/routes/**`, `apps/web/src/api/client.ts`, `apps/web/src/components/**`, `apps/web/src/**/*.test.tsx`, `apps/web/e2e/*.spec.ts`.
- **Approach:**
  1. Routes: recipes (list, detail, edit), catalog, week (plan view with overlap/leftover panel), cook view (step-by-step, scaled), stats, taste profile, share view `/s/:token` with import wizard.
  2. Recipe editor with ingredient autocomplete over catalog + aliases and inline "create ingredient". Inline create asks for name, canonical unit (prefilled from the line's unit, required) and optional pack sizes, and notes that the canonical unit is fixed once recipes use it (U12). Unresolved-unit flags render on the offending line with two actions: "convert" replaces that line's amount and unit; "add conversion" stores a factor into the canonical unit on the ingredient and re-checks every flagged line (R6).
  3. Import wizard shows each source line with a suggested match (name/alias) and lets the user pick or create; same flag handling.
  4. Week view recomputes evaluation on every change via the API.
- **Test scenarios:**
  - Recipe editor shows a flag on a line whose unit cannot be normalized and clears it after adding a conversion.
  - Autocomplete matches an alias and inserts the canonical ingredient.
  - Week view shows overlap and leftover figures returned by the API for a two-recipe week.
  - Cook view at 4 servings shows doubled amounts for a 2-serving recipe and advances steps one at a time.
  - Share view renders for a logged-out visitor and offers sign-in to import.
  - E2E (Playwright against the server with a fake auth session): create two recipes, plan both, see the combined list, mark one cooked with a rating, see it in stats.
- **Verification:** Component tests and the E2E flow pass.

### U10. Offline shopping list PWA

- **Goal:** The shopping list works offline on a phone and syncs check-offs when back online.
- **Requirements:** R14, R15, R16, F2, AE4; KTD8.
- **Dependencies:** U5, U9.
- **Files:** `apps/web/vite.config.ts`, `apps/web/src/pwa/**`, `apps/web/src/routes/shopping/**`, `apps/web/src/pwa/*.test.ts`, `apps/web/e2e/offline.spec.ts`.
- **Approach:**
  1. `vite-plugin-pwa` with manifest (name, icons, `display: standalone`) and precached app shell; the navigation fallback denylists `/auth/`, `/api/`, `/mcp` and `/.well-known/` so sign-in redirects and API calls always reach the server.
  2. Shopping route reads from IndexedDB first, then refreshes from the API when online.
  3. Op queue in IndexedDB; flush on `online` events and on app start; show a small "offline, N changes pending" indicator.
  4. When the list was never cached, show "open once online to use offline"; when a flush gets 401 (session expired), keep the ops and show "sign in to sync N changes".
- **Test scenarios:**
  - Op queue persists across a reload and flushes in insertion order.
  - A flush failure keeps the ops queued.
  - A flush that gets 401 keeps the ops and shows the sign-in prompt; after sign-in they sync.
  - With the service worker active, navigating to `/auth/login` reaches the server redirect instead of the cached shell.
  - Covers AE4. E2E with the browser context set offline: open the cached list, check two items, go online, and the server shows both checked.
  - Extra item added offline appears on the server after reconnect.
- **Verification:** Offline E2E passes; Lighthouse reports the app as installable.

### U11. Packaging, release and deployment

- **Goal:** Each merge to `main` can publish a versioned image and Helm chart, and the cluster can run the service.
- **Requirements:** R27; KTD1, KTD12.
- **Dependencies:** U8, U10; live rollout also depends on THI-49 (exposure) and THI-50 (Postgres).
- **Files:** `apps/server/Dockerfile`, `apps/server/chart/**`, `.github/workflows/release.yml`, `.github/rulesets/tag-releases.json`, `nx.json` (release config), `DEPLOYMENT.md`.
- **Approach:**
  1. Multi-stage Dockerfile building web and server, running as non-root on Node 22.
  2. Helm chart: Deployment with liveness/readiness on `/healthz`/`/readyz`, Service, Ingress (host + TLS from values), env from a Secret (DB URL, WorkOS keys, cookie password).
  3. `nx release` config and release workflow copied from tiny-dash with `server-v*` tags and chart version sync.
  4. `DEPLOYMENT.md` describing secrets (via 1Password operator in the kubernetes repo), WorkOS dashboard settings (sign-up disabled, CIMD + DCR, redirect URIs, resource indicator), and the rollout command.
- **Patterns to follow:** `tiny-dash` `DEPLOYMENT.md`, `.github/workflows/release.yml`, `api/chart`.
- **Test expectation:** none -- packaging; proven by smoke checks.
- **Verification:** `docker build` succeeds and the container serves `/healthz`; `helm lint` and `helm template` pass; a release run publishes image and chart to GHCR. After the live rollout, an invited email can sign in and an uninvited one cannot sign up (WorkOS public sign-up disabled, R1), and claude.ai connects to the public `/mcp` URL as a remote connector and lists tools.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Lint | `pnpm nx affected -t lint` | every unit |
| Typecheck | `pnpm nx affected -t typecheck` | every unit |
| Unit and integration tests (PGlite where a database is used) | `pnpm nx affected -t test` | U2–U10, U12 |
| Web E2E (Playwright) | `pnpm nx run web:e2e` | U9, U10 |
| Build | `pnpm nx affected -t build` | every unit |
| Container smoke | build image, run, `curl /healthz` | U11 |
| Chart | `helm lint apps/server/chart` and `helm template` | U11 |

CI runs lint, typecheck, test and build through `nx affected` on every PR; the `validate` job is the required status check on `main`.

## Definition of Done

- Every requirement R1–R27 (R17 removed) is implemented by at least one unit and covered by a test or a stated verification step.
- Every acceptance example AE1–AE6 has a test labelled `Covers AE<N>`.
- Every domain module and both adapters (API, MCP) have a cross-user isolation test.
- CI is green on `main`, and the release workflow has published at least one image and chart.
- No secrets, emails or recipe text appear in logs.
- `AGENTS.md`, `README.md` and `DEPLOYMENT.md` describe how to run, test and deploy.
- Dead-end and experimental code from abandoned approaches is removed from the diff.
