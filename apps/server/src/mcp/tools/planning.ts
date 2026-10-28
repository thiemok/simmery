import type { McpServer } from '@modelcontextprotocol/server';
import { evaluateCandidateWeek, getShoppingList, getWeek, setWeekEntries } from '@simmery/domain';
import { z } from 'zod';
import { candidateEntries, weekEntries } from '../../routes/schemas.js';
import { defineTool, readOnly, type ToolContext } from '../result.js';

const weekKey = z.string().describe('ISO week, e.g. 2026-W44 (weeks start on Monday)');

export function registerPlanningTools(server: McpServer, ctx: ToolContext) {
  const { db, userId, now } = ctx;

  defineTool(
    server,
    ctx,
    'get_week',
    {
      description:
        "Reads the user's plan for a week: its entries (recipe, servings, optional weekday 1-7) and their evaluation (ingredient totals, overlap between meals, estimated leftovers, tag variety).",
      inputSchema: z.object({ weekKey }),
      annotations: readOnly,
    },
    ({ weekKey }) => getWeek(db, userId, weekKey, now()),
  );

  defineTool(
    server,
    ctx,
    'evaluate_week',
    {
      description:
        'Evaluates a candidate week without saving it: ingredient totals, ingredients used by more than one meal, estimated leftovers from pack sizes, and tag variety. Use it to compare candidate weeks before `set_week_entries`.',
      inputSchema: z.object({ entries: candidateEntries }),
      annotations: readOnly,
    },
    ({ entries }) => evaluateCandidateWeek(db, userId, entries),
  );

  defineTool(
    server,
    ctx,
    'set_week_entries',
    {
      description:
        "Replaces a week's entries. Pass each existing entry's `id` from `get_week` to keep it (its servings and day are updated in place); entries without an `id` are added, and entries left out are removed. Removing an entry that was already cooked is refused with `entry_cooked`.",
      inputSchema: z.object({ weekKey, entries: weekEntries }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ weekKey, entries }) => setWeekEntries(db, userId, weekKey, entries, now()),
  );

  defineTool(
    server,
    ctx,
    'get_shopping_list',
    {
      description:
        "Reads a week's shopping list: per-ingredient totals in canonical units across all planned meals, scaled to their servings, with check-off state, plus free-text extras.",
      inputSchema: z.object({ weekKey }),
      annotations: readOnly,
    },
    ({ weekKey }) => getShoppingList(db, userId, weekKey, now()),
  );
}
