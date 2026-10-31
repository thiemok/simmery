import { expect, signedInContext, test } from './fixtures';

test('a shared recipe opens signed out with a sign-in offer, and another user imports it', async ({
  page,
  browser,
}) => {
  await page.goto('/recipes/new');
  await page.getByLabel('Title', { exact: true }).fill('Pancakes');
  await page.getByLabel('Amount, line 1').fill('250');
  await page.getByLabel('Unit, line 1').fill('g');
  await page.getByRole('combobox', { name: 'Ingredient, line 1' }).fill('flour');
  await page.getByRole('option', { name: 'Create “flour”' }).click();
  await page
    .getByRole('group', { name: 'New ingredient' })
    .getByRole('button', { name: 'Create ingredient' })
    .click();
  await page.getByLabel('Step 1', { exact: true }).fill('Whisk and fry.');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await page.getByRole('button', { name: 'Create share link' }).click();
  const link = await page.getByLabel('Share link').inputValue();
  expect(link).toMatch(/\/s\/[\w-]+$/);

  const visitor = await browser.newContext();
  const anonymous = await visitor.newPage();
  await anonymous.goto(link);
  await expect(anonymous.getByRole('heading', { level: 1, name: 'Pancakes' })).toBeVisible();
  await expect(anonymous.getByRole('link', { name: 'Sign in to import' })).toHaveAttribute(
    'href',
    `/auth/login?returnTo=${encodeURIComponent(new URL(link).pathname)}`,
  );
  await visitor.close();

  const friend = await signedInContext(browser);
  const friendPage = await friend.newPage();
  await friendPage.goto(link);
  await friendPage.getByRole('button', { name: 'Import' }).click();
  await friendPage.getByRole('combobox', { name: 'Ingredient, line 1' }).fill('flour');
  await friendPage.getByRole('option', { name: 'Create “flour”' }).click();
  await friendPage
    .getByRole('group', { name: 'New ingredient' })
    .getByRole('button', { name: 'Create ingredient' })
    .click();
  await friendPage.getByRole('button', { name: 'Import recipe' }).click();

  await expect(friendPage).toHaveURL(/\/recipes\/[\w-]+$/);
  await expect(friendPage.getByRole('heading', { level: 1, name: 'Pancakes' })).toBeVisible();
  await friendPage.goto('/recipes');
  await expect(friendPage.getByRole('link', { name: /Pancakes/ })).toBeVisible();
  await friend.close();
});
