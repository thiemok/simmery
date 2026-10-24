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
- **Open blockers:** None. Items under Outstanding Questions are deferred to planning.

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
- **Each ingredient has one canonical unit and any number of pack sizes** (session-settled: user-directed — added during synthesis review: several pack sizes are often available, and a stored unit makes mismatches like "2 cloves + 50 g" detectable at entry and keeps a user's data consistent). Governs R4, R5, R6, R17.
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
- R17. Each list line can show which pack sizes to buy for the needed amount.

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
  - **Covered by:** R14, R15, R16, R17, R18, R19
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
- AE2. **Covers R13, R17.** Given cream has pack sizes 200 ml and 500 ml and the week needs 350 ml, the list suggests a 500 ml pack and the planning view shows about 150 ml left over.
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

- A managed auth provider that supports invite-gated sign-up and acts as the OAuth authorization server MCP clients need (assumption until the provider is chosen).
- The home cluster can be exposed publicly for one hostname with TLS (traefik is present; the exposure path, such as a public domain or tunnel, is not chosen yet).
- No Postgres runs on the cluster today; one has to be provisioned.
- The user and their agent fill in pack sizes and conversions over time; waste figures are only as good as that data.
- English UI; recipe content in any language.

### Outstanding Questions

**Deferred to Planning**

- Which managed auth provider (e.g. WorkOS AuthKit, Clerk, Auth0), judged mainly on MCP OAuth support, invite gating and free-tier limits.
- How the cluster is exposed publicly (port forward with a public domain, Cloudflare Tunnel or Tailscale Funnel) and which domain is used.
- How Postgres is run (an operator such as CloudNativePG vs a single StatefulSet) and how it is backed up.
- Backend and frontend frameworks within full-stack TypeScript, and the offline sync mechanism for the shopping list.
- How leftover "closest fit" picks pack combinations when several sizes exist.
- The exact MCP tool surface and granularity.

### Sources / Research

- `tiny-dash` (sibling repo next to this one): reference for the Nx/pnpm monorepo, GHCR image and Helm chart release flow (`DEPLOYMENT.md`), and OpenTelemetry conventions.
- `kubernetes` (sibling repo next to this one): k3s cluster with traefik, tailscale operator, 1Password operator for secrets, local-path storage and the Dash0 operator; no database or identity provider present.
