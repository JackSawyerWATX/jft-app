import { expect, test, type Page } from '@playwright/test';
import { reflection } from '../../src/shares/reflection-fixture';

const fictionalText =
  'A fictional thought for a fellow alcoholic.\nOne day at a time.';
async function save(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox').fill(fictionalText);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/shares') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
  return (await response).json();
}

test('share icon uses the saved URL directly for native sharing and session-free reading', async ({
  page,
  browser,
  baseURL
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        Object.assign(window, { sharedUrl: data.url });
      }
    })
  );
  let linkRequests = 0;
  page.on('request', (request) => {
    if (/\/api\/shares\/[^/]+\/link$/.test(request.url())) linkRequests++;
  });
  const saved = await save(page);
  const link = new URL(saved.shareUrl, baseURL).href;
  expect(new URL(link).pathname).toBe(`/s/${saved.id}`);
  expect(new URL(link).search).toBe('');
  const button = page.getByRole('button', {
    name: 'Share with fellow alcoholic',
    exact: true
  });
  await button.click();
  expect(await page.evaluate(() => Reflect.get(window, 'sharedUrl'))).toBe(
    link
  );
  expect(linkRequests).toBe(0);
  await expect(page.getByLabel('Sharing link')).toHaveCount(0);
  await expect(page.getByText(/expires|revoked/i)).toHaveCount(0);
  await expect(
    page.getByText('Anyone with this link can view your share.', {
      exact: true
    })
  ).toBeVisible();
  const recipient = await browser.newContext();
  try {
    const reader = await recipient.newPage();
    const response = await reader.goto(link);
    expect(response!.status()).toBe(200);
    expect(response!.headers()['cache-control']).toContain('private');
    expect(response!.headers()['cache-control']).toContain('no-store');
    expect(response!.headers()['x-robots-tag']).toBe('noindex, nofollow');
    expect(response!.headers()['referrer-policy']).toBe('no-referrer');
    expect(response!.headers()['set-cookie']).toBeUndefined();
    await expect(
      reader.getByRole('heading', { name: reflection.title })
    ).toBeVisible();
    await expect(
      reader.getByText(reflection.body, { exact: true })
    ).toBeVisible();
    await expect(reader.getByLabel('Shared thoughts')).toContainText(
      fictionalText
    );
    await expect(
      reader.getByText('April 23, 2025', { exact: false })
    ).toBeVisible();
    expect(await recipient.cookies()).toEqual([]);
    const publicPath = `/api/public/shares/${saved.id}`;
    const publicResponse = await recipient.request.get(publicPath);
    expect(await publicResponse.json()).toEqual({
      reflection,
      text: fictionalText
    });
    expect(publicResponse.headers()['set-cookie']).toBeUndefined();
    expect(await recipient.cookies()).toEqual([]);
    expect(
      (await recipient.request.get(`/api/shares/${saved.id}`)).status()
    ).toBe(404);
    expect(await (await recipient.request.get('/api/shares')).json()).toEqual(
      []
    );
    for (const id of ['invalid', '95eff0e1-bca7-4fd1-83d2-42ba330aab22']) {
      await reader.goto(`/s/${id}`);
      await expect(
        reader.getByRole('heading', { name: 'This share is unavailable' })
      ).toBeVisible();
      await expect(reader.getByLabel('Shared thoughts')).toHaveCount(0);
    }
    expect(
      (await recipient.request.get('/api/public/shares/invalid')).status()
    ).toBe(404);
  } finally {
    await recipient.close();
  }
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await page.getByRole('listitem').getByRole('button').click();
  await button.click();
  expect(await page.evaluate(() => Reflect.get(window, 'sharedUrl'))).toBe(
    link
  );
  expect(linkRequests).toBe(0);
});

test('unsupported native sharing copies directly, with manual copying only when needed', async ({
  page,
  baseURL
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          Object.assign(window, { copiedUrl: value });
        }
      }
    });
  });
  const saved = await save(page);
  const button = page.getByRole('button', {
    name: 'Share with fellow alcoholic',
    exact: true
  });
  await button.click();
  await expect(page.getByRole('status')).toHaveText('Link copied.');
  expect(await page.evaluate(() => Reflect.get(window, 'copiedUrl'))).toBe(
    new URL(saved.shareUrl, baseURL).href
  );
  await expect(page.getByLabel('Sharing link')).toHaveCount(0);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Denied');
        }
      }
    })
  );
  await button.click();
  await expect(page.getByLabel('Sharing link')).toBeFocused();
  await expect(page.getByLabel('Sharing link')).toHaveValue(
    new URL(saved.shareUrl, baseURL).href
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    })
  );
  await button.click();
  await expect(page.getByLabel('Sharing link')).toBeFocused();
});

test('native cancellation stays silent and native failures fall back to copying', async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new DOMException('Canceled', 'AbortError');
      }
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          Object.assign(window, { copied: true });
        }
      }
    });
  });
  await save(page);
  const button = page.getByRole('button', {
    name: 'Share with fellow alcoholic',
    exact: true
  });
  await button.click();
  await expect(button).toBeEnabled();
  expect(
    await page.evaluate(() => Reflect.get(window, 'copied'))
  ).toBeUndefined();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByLabel('Sharing link')).toHaveCount(0);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new Error('Unavailable');
      }
    })
  );
  await button.click();
  await expect(page.getByRole('status')).toHaveText('Link copied.');
});

test('long thoughts appear in full on owner and recipient pages, and recipients can start writing', async ({
  page,
  browser,
  baseURL
}) => {
  const text =
    'A fictional reflection about making space for another person. '.repeat(8) +
    'The complete context is here. 👨‍👩‍👧‍👦';
  await page.goto('/');
  await page.getByRole('textbox').fill(text);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/shares') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save privately' }).click();
  const saved = await (await response).json();
  await expect(
    page.locator('article').getByText(text, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Read more|Show less/ })
  ).toHaveCount(0);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('listitem')).toContainText(text);
  await page.getByRole('listitem').getByRole('button').click();
  await expect(
    page.locator('article').getByText(text, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('A moment you made space for yourself.')
  ).toHaveCount(0);
  const recipient = await browser.newContext();
  try {
    const reader = await recipient.newPage();
    await reader.goto(new URL(saved.shareUrl, baseURL).href);
    await expect(
      reader
        .getByRole('region', { name: 'Shared thoughts' })
        .getByText(text, { exact: true })
    ).toBeVisible();
    await expect(
      reader.getByRole('button', { name: /Read more|Show less/ })
    ).toHaveCount(0);
    expect(await recipient.cookies()).toEqual([]);
    const write = reader.getByRole('link', {
      name: 'Write your own share',
      exact: true
    });
    await expect(write).toHaveAttribute('href', '/');
    await write.click();
    await expect(
      reader.getByRole('heading', { name: 'Your thoughts', exact: true })
    ).toBeVisible();
    await reader
      .getByRole('textbox')
      .fill('A fictional response from the recipient.');
    await expect(
      reader.getByRole('button', { name: 'Save privately' })
    ).toBeEnabled();
    expect(await (await recipient.request.get('/api/shares')).json()).toEqual(
      []
    );
  } finally {
    await recipient.close();
  }
});
