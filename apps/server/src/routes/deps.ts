import type { Database } from '@simmery/db';
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware.js';

export interface RouteDeps {
  db: Database;
  now: () => Date;
}

export const authedRouter = () => new Hono<AuthEnv>();
