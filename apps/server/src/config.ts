import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  WORKOS_API_KEY: z.string().min(1),
  WORKOS_CLIENT_ID: z.string().min(1),
  // iron-webcrypto seals the session cookie and needs at least 32 characters.
  WORKOS_COOKIE_PASSWORD: z.string().min(32),
  PUBLIC_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .refine((url) => !url.endsWith('/'), 'must not end with a slash'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ROOT: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

/** Names every invalid variable but never echoes a value, since most are secrets. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = String(issue.path[0]);
      return `${name}: ${env[name] === undefined ? 'missing' : 'invalid'}`;
    });
    throw new Error(`invalid configuration: ${problems.join(', ')}`);
  }
  return result.data;
}
