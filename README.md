# Simmery

Recipes, weekly meal planning, shopping and cooking, for a small invited group, with an MCP server so your own AI agent can plan the week with you.

- Keep your recipes and your own ingredient catalog (canonical units, pack sizes)
- Plan a week of meals and see ingredient overlap and expected leftovers
- Shop from one aggregated list that works offline on your phone
- Cook from recipes scaled to your servings, then rate them
- Share recipes by read-only link; friends can import a copy
- Connect an agent over MCP to propose weeks, maintain your taste profile and add recipes

Status: early planning. See [`docs/plans/`](docs/plans/) for the product contract.

## Development

Requires Node (see `.nvmrc`) and pnpm.

```bash
pnpm install
pnpm nx run-many -t lint test build
```
