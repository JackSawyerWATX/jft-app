import { expect, test } from '@playwright/test';

test('retains a draft through About, browser Back, refresh, and a failed save; clears it after saving', async ({
  page
}) => {
  const text = 'A fictional unfinished reflection.\nWords to return to.';
  await page.goto('/');
  await page.getByRole('textbox').fill(text);
  await page.getByRole('link', { name: 'About Doorknob' }).click();
  await expect(
    page.getByRole('heading', { name: 'The Story of the Doorknob' })
  ).toBeVisible();
  await page
    .getByRole('link', { name: "Today's reflection", exact: true })
    .click();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await page.getByRole('link', { name: 'About Doorknob' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole('heading', { name: 'The Story of the Doorknob' })
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await page.route('**/api/shares', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'Please try again.' }
        })
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(page.locator('form').getByRole('alert')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await page.unroute('**/api/shares');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue('');
});

test('does not restore a deliberately erased draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('A fictional draft to erase.');
  await page.getByRole('textbox').fill('');
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue('');
});

test('editing and saving still work when browser storage is unavailable', async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage unavailable', 'SecurityError');
      }
    });
  });
  await page.goto('/');
  await page
    .getByRole('textbox')
    .fill('A fictional reflection without browser storage.');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
});
