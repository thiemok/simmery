import type { McpServer } from '@modelcontextprotocol/server';
import { getStatistics } from '@simmery/domain';
import { z } from 'zod';
import { defineTool, readOnly, type ToolContext } from '../result.js';

export function registerHistoryTools(server: McpServer, ctx: ToolContext) {
  const { db, userId, now } = ctx;

  defineTool(
    server,
    ctx,
    'get_cook_history',
    {
      description:
        "The user's cook history: per recipe how often and when it was last cooked and its average rating (1-5), the recipes not cooked in a while, and every cook event with its rating.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => {
      const { recipes, notCookedRecently, cooks } = await getStatistics(db, userId, now());
      return { recipes, notCookedRecently, cooks };
    },
  );

  defineTool(
    server,
    ctx,
    'get_statistics',
    {
      description:
        'Week trends for recent weeks (ingredient totals, overlap, leftovers, tag variety) and the most bought ingredients.',
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => {
      const { weeks, mostBought } = await getStatistics(db, userId, now());
      return { weeks, mostBought };
    },
  );
}
