import { test as base, type Browser, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const E2E_URL = `http://localhost:${process.env.E2E_PORT ?? 4310}`;

/** A browser context signed in as a new user, through the harness's fake session (KTD15). */
export async function signedInContext(browser: Browser, options = {}): Promise<BrowserContext> {
  const id = `user_${randomUUID()}`;
  const context = await browser.newContext(options);
  await context.addCookies([
    {
      name: 'simmery_session',
      value: encodeURIComponent(`active|${id}|${id}@e2e.test`),
      url: E2E_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  return context;
}

export const test = base.extend({
  context: async ({ browser, contextOptions }, use) => {
    const context = await signedInContext(browser, contextOptions);
    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
