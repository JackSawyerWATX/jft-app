import { expect, test } from './fixtures/test';
import type { Page } from '@playwright/test';
import type { Share } from '../../src/shares/model';

async function seedHistory(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox').fill('Fictional session preparation.');
  await expect(
    page.getByRole('button', { name: 'Save privately' })
  ).toBeEnabled();
  await page.getByRole('textbox').fill('');
  const saved: Share[] = [];
  for (let index = 0; index < 23; index++) {
    const response = await page.request.post('/api/shares', {
      data: { text: `Fictional paginated share ${index}.` }
    });
    expect(response.status()).toBe(201);
    saved.push(await response.json());
  }
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('listitem')).toHaveCount(20);
  return saved;
}

test('deduplicates an overlapping record in a later history page', async ({
  page
}) => {
  const saved = await seedHistory(page);
  const overlapping = saved.at(-1)!;
  await page.route('**/api/shares?*', async (route) => {
    const response = await route.fetch();
    const older = await response.json();
    await route.fulfill({ response, json: [overlapping, ...older] });
  });
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(23);
  await expect(
    page.getByRole('listitem').filter({ hasText: overlapping.text })
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true })
  ).toHaveCount(0);
});

test('failed later page preserves earlier shares and can be retried', async ({
  page
}) => {
  await seedHistory(page);
  let fail = true;
  await page.route('**/api/shares?*', async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Fictional unavailable page.'
          }
        })
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'More shares could not be read'
  );
  await expect(page.getByRole('listitem')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(23);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('refresh discards an older pending continuation response', async ({
  page
}) => {
  await seedHistory(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured!: () => void;
  const capturedPage = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route('**/api/shares?*', async (route) => {
    const response = await route.fetch();
    captured();
    await pending;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await capturedPage;
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Today’s reflection', exact: true })
      .click();
    await page.request.post('/api/shares', {
      data: { text: 'Fictional newly refreshed share.' }
    });
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Past shares', exact: true })
      .click();
    await expect(page.getByRole('listitem').first()).toContainText(
      'Fictional newly refreshed share.'
    );
    const completed = page.waitForResponse((response) =>
      response.url().includes('/api/shares?')
    );
    release();
    await completed;
    await expect(page.getByRole('listitem')).toHaveCount(20);
    await expect(page.getByRole('listitem').first()).toContainText(
      'Fictional newly refreshed share.'
    );
    await expect(
      page.getByRole('button', { name: 'Load more', exact: true })
    ).toBeEnabled();
  } finally {
    release();
  }
});

test('successful save remains available when the next history read is temporarily stale', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('Fictional eventually visible share.');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
  await expect(page.locator('article')).toContainText(
    'Fictional eventually visible share.'
  );
  let reads = 0;
  await page.route('**/api/shares', async (route) => {
    if (route.request().method() === 'GET' && ++reads === 1)
      await route.fulfill({ json: [] });
    else await route.continue();
  });
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByText('A place for your words.')).toBeVisible();
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Today’s reflection', exact: true })
    .click();
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('listitem').getByRole('button').click();
  await expect(page.locator('article')).toContainText(
    'Fictional eventually visible share.'
  );
});
