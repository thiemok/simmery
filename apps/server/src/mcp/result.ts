import type {
  CallToolResult,
  McpServer,
  ToolAnnotations,
  ToolCallback,
} from '@modelcontextprotocol/server';
import type { Database } from '@simmery/db';
import type { z } from 'zod';
import { domainErrorBody } from '../errors.js';
import { safeError, type Logger } from '../logger.js';

/** What every tool runs with: one request, one user (KTD10). */
export interface ToolContext {
  db: Database;
  now: () => Date;
  logger: Logger;
  userId: string;
}

function result(value: unknown, isError = false): CallToolResult {
  // Round-trip through JSON so dates and the text content agree.
  const text = JSON.stringify(Array.isArray(value) ? { items: value } : value);
  return {
    content: [{ type: 'text', text }],
    structuredContent: JSON.parse(text) as Record<string, unknown>,
    ...(isError ? { isError } : {}),
  };
}

/**
 * Registers a tool whose domain errors come back as results with the API's
 * error body, so an agent can act on them (unit flags, not found). Anything
 * else is logged and answered as `internal`: the SDK would send the raw
 * message, and drizzle messages embed query parameters.
 */
export function defineTool<Input extends z.ZodObject>(
  server: McpServer,
  { logger }: ToolContext,
  name: string,
  config: { description: string; inputSchema: Input; annotations?: ToolAnnotations },
  run: (input: z.output<Input>) => Promise<unknown>,
) {
  // The SDK infers arguments through Standard Schema, which a generic zod object cannot resolve.
  const callback = async (input: z.output<Input>) => {
    try {
      return result(await run(input));
    } catch (error) {
      const domain = domainErrorBody(error);
      if (domain) {
        return result(domain.body, true);
      }
      logger.error({ err: safeError(error), tool: name }, 'tool failed');
      return result({ error: 'internal' }, true);
    }
  };
  server.registerTool(name, config, callback as ToolCallback<Input>);
}

export const readOnly: ToolAnnotations = { readOnlyHint: true };
