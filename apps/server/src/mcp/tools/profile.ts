import type { McpServer } from '@modelcontextprotocol/server';
import { getTasteProfile, updateTasteProfile } from '@simmery/domain';
import { z } from 'zod';
import { defineTool, readOnly, type ToolContext } from '../result.js';

export function registerProfileTools(server: McpServer, ctx: ToolContext) {
  const { db, userId } = ctx;

  defineTool(
    server,
    ctx,
    'get_taste_profile',
    {
      description:
        "Reads the user's taste profile: freeform markdown about likes, dislikes, diet and allergies. Read it before proposing recipes or weeks.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => getTasteProfile(db, userId),
  );

  defineTool(
    server,
    ctx,
    'update_taste_profile',
    {
      description:
        'Replaces the whole taste profile with `body` (markdown). Read it first and send the full updated text; anything left out is lost.',
      inputSchema: z.object({ body: z.string() }),
      annotations: { idempotentHint: true },
    },
    ({ body }) => updateTasteProfile(db, userId, body),
  );
}
