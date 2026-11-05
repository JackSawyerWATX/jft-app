import { expect, test, type Page } from './fixtures/test';

async function fitsViewport(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
}

for (const width of [320, 375, 390, 430]) {
  test(`reading, saving, history, recipient, and About fit at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await fitsViewport(page);
    await page.getByRole('textbox').focus();
    // A reduced viewport checks controls remain reachable when vertical space is limited.
    // It does not emulate a physical phone's software keyboard.
    await page.setViewportSize({ width, height: 400 });
    const text = 'A fictional long reflection. '.repeat(25) + 'x'.repeat(100);
    await page.getByRole('textbox').fill(text);
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/shares') && r.request().method() === 'POST'
    );
    const save = page.getByRole('button', { name: 'Save privately' });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await save.click();
    const share = await (await response).json();
    await expect(
      page.getByRole('heading', { name: 'Your share is saved.' })
    ).toBeVisible();
    await page.setViewportSize({ width, height: 740 });
    await fitsViewport(page);
    const sharing = page.getByRole('button', {
      name: 'Share with fellow alcoholic',
      exact: true
    });
    await sharing.scrollIntoViewIfNeeded();
    await expect(sharing).toBeInViewport();
    const bounds = await sharing.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page
      .getByRole('main')
      .getByRole('button', { name: 'Past shares', exact: true })
      .click();
    await expect(page.getByRole('listitem')).toContainText(text);
    await fitsViewport(page);
    await page.goto(share.shareUrl);
    await expect(
      page.getByRole('region', { name: 'Shared thoughts' })
    ).toContainText(text);
    await fitsViewport(page);
    await page
      .getByRole('link', { name: 'Write your own share' })
      .scrollIntoViewIfNeeded();
    await page.getByRole('link', { name: 'Write your own share' }).click();
    await page.getByRole('link', { name: 'About Doorknob' }).click();
    await expect(
      page.getByRole('heading', { name: 'The Story of the Doorknob' })
    ).toBeVisible();
    await fitsViewport(page);
  });
}
