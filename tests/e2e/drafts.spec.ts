import { expect, test } from './fixtures/test';

test('refresh starts fresh, ignores legacy stored drafts, and retains saved history', async ({
  page
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('doorknob:share-draft', 'Fictional legacy draft.')
  );
  await page.goto('/');
  const field = page.getByRole('textbox', { name: 'Your share' });
  await expect(field).toHaveValue('');
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem('doorknob:share-draft'))
    )
    .toBe('Fictional legacy draft.');
  await field.fill('A fictional draft to discard.');
  await page.reload();
  await expect(field).toHaveValue('');
  await expect(page.getByLabel('Listening time')).toHaveText('00:00');
  await expect(
    page.getByRole('button', { name: 'Save privately' })
  ).toBeDisabled();
  await expect(page.getByText('Edit your share', { exact: true })).toHaveCount(
    0
  );
  await expect(
    page.getByText(/Speech recognition is provided by your browser/)
  ).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await field.fill('A fictional saved share to keep.');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
  await page.reload();
  await expect(field).toHaveValue('');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares' })
    .click();
  await expect(page.getByRole('listitem')).toContainText(
    'A fictional saved share to keep.'
  );
});

test('retains drafts through in-app views and a failed save, then discards them on refresh', async ({
  page
}) => {
  await page.goto('/');
  const text = 'Fictional unsaved words.';
  await page.getByRole('textbox').fill(text);
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares' })
    .click();
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Today’s reflection' })
    .click();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await page.route('**/api/shares', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'Please try again.' }
        })
      });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(page.locator('form').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(text);
  await page.reload();
  await expect(page.getByRole('textbox')).toHaveValue('');
});

test('typing and saving work when browser storage is unavailable', async ({
  page
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('Storage unavailable', 'SecurityError');
      }
    })
  );
  await page.goto('/');
  await page
    .getByRole('textbox')
    .fill('A fictional reflection without browser storage.');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
});
