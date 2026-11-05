import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './fixtures/test';
import { mockSpeech, emit } from './fixtures/openai-browser';

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  // Keep report details structural: no text/HTML snapshots or provider data.
  expect(
    results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      affectedNodes: nodes.length
    }))
  ).toEqual([]);
}

test('composer, listening, Tidying and editable results pass accessibility scans', async ({
  page
}) => {
  await mockSpeech(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/shares/cleanup', async (route) => {
    await pending;
    await route.fulfill({
      json: { text: 'A fictional reflection.\n\nAnother thought.' }
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Record your share' })
  ).toBeEnabled();
  await accessible(page);
  await page.getByRole('button', { name: 'Record your share' }).click();
  await emit(page, 'speechStart');
  await emit(page, 'speechResult', [
    ['A fictional reflection. Another thought.', true]
  ]);
  await accessible(page);
  await emit(page, 'speechEnd');
  await expect(page.getByRole('status')).toHaveText('Tidying!');
  await accessible(page);
  release();
  await expect(page.getByRole('textbox')).toHaveValue(
    'A fictional reflection.\n\nAnother thought.'
  );
  await accessible(page);
});

test('saved preview, expanded thoughts, manual copying, history and recipient pass accessibility scans', async ({
  page,
  browser,
  baseURL,
  watchPage
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
  });
  await page.goto('/');
  await page
    .getByRole('textbox')
    .fill('A fictional reflection on making space today. '.repeat(12));
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/shares') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save privately' }).click();
  const share = await (await response).json();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
  await accessible(page);
  await page.getByRole('button', { name: 'Read more', exact: true }).click();
  await accessible(page);
  await page
    .getByRole('button', { name: 'Share with fellow alcoholic', exact: true })
    .click();
  await expect(page.getByLabel('Sharing link')).toBeVisible();
  await accessible(page);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('listitem').getByRole('button').hover();
  await accessible(page);
  const recipient = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const reader = await recipient.newPage();
    watchPage(reader);
    await reader.goto(new URL(share.shareUrl, baseURL).href);
    await expect(
      reader.getByRole('heading', { name: 'Their thoughts' })
    ).toBeVisible();
    await accessible(reader);
  } finally {
    await recipient.close();
  }
});
