import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function createRecipe(page: Page, title: string, addLine: () => Promise<void>) {
  await page.goto('/recipes/new');
  await page.getByLabel('Title', { exact: true }).fill(title);
  await addLine();
  await page.getByLabel('Step 1', { exact: true }).fill('Cook it.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

async function pickIngredient(page: Page, text: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: 'Ingredient, line 1' }).fill(text);
  await page.getByRole('option', { name: option }).click();
}

test('create two recipes, plan both, see the combined list, cook one with a rating, see it in stats', async ({
  page,
}) => {
  await createRecipe(page, 'Onion soup', async () => {
    await page.getByLabel('Amount, line 1').fill('2');
    await page.getByLabel('Unit, line 1').fill('piece');
    await pickIngredient(page, 'onion', 'Create “onion”');
    const form = page.getByRole('group', { name: 'New ingredient' });
    await expect(form.getByLabel('Canonical unit')).toHaveValue('piece');
    await form.getByRole('button', { name: 'Create ingredient' }).click();
    await expect(page.getByRole('combobox', { name: 'Ingredient, line 1' })).toHaveValue('onion');
  });

  await createRecipe(page, 'Onion tart', async () => {
    await page.getByLabel('Amount, line 1').fill('100');
    await page.getByLabel('Unit, line 1').fill('g');
    await pickIngredient(page, 'oni', /^onion/);
    await expect(page.getByText('“g” cannot be turned into piece for onion.')).toBeVisible();
    await page.getByRole('button', { name: 'Add conversion' }).click();
    await page.getByLabel('1 g = how many piece?').fill('0.01');
    await page.getByRole('button', { name: 'Save conversion' }).click();
    await expect(page.getByText(/cannot be turned into/)).toBeHidden();
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/week\/\d{4}-W\d{2}$/);
  for (const title of ['Onion soup', 'Onion tart']) {
    await page.getByRole('button', { name: '+ Add a meal' }).click();
    await page.getByRole('button', { name: `Add ${title}` }).click();
    await expect(page.getByRole('button', { name: `Remove ${title}` })).toBeVisible();
  }

  const overlap = page.locator('section', { has: page.getByRole('heading', { name: 'Overlap' }) });
  await expect(overlap.getByText('onion · 2 meals')).toBeVisible();
  const totals = page.locator('section', {
    has: page.getByRole('heading', { name: 'Everything this week' }),
  });
  await expect(totals.getByText('3 piece')).toBeVisible();

  await page.getByRole('link', { name: 'Cook' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Onion soup' })).toBeVisible();
  await page
    .getByRole('group', { name: 'Rating for this cook' })
    .getByRole('button', { name: '5 stars' })
    .click();
  await page.getByRole('button', { name: 'Mark cooked' }).click();
  await expect(page.getByText(/^Cooked \d/)).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Stats' })
    .click();
  const history = page.locator('section', {
    has: page.getByRole('heading', { name: 'Cook history' }),
  });
  const row = history.getByRole('row', { name: /Onion soup/ });
  await expect(row).toContainText('1×');
  await expect(row).toContainText('5 ★');
});
