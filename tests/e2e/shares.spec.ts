import { expect, test } from '@playwright/test';

// Each test gets an isolated browser context and uses invented reflection text.
test('saves, persists, and opens shares in newest-first order', async ({
  page
}) => {
  await page.goto('/');
  const save = page.getByRole('button', { name: 'Save privately' });
  await expect(save).toBeDisabled();
  await page.getByRole('textbox').fill(' \n ');
  await expect(save).toBeDisabled();
  await page
    .getByRole('textbox')
    .fill('A fictional first thought.\nOne small step.');
  await save.click();
  await expect(
    page.getByRole('heading', { name: 'Your share has been saved.' })
  ).toBeFocused();
  await expect(page.locator('article')).toContainText('One small step.');
  await page.reload();
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await page
    .getByRole('listitem')
    .filter({ hasText: 'A fictional first thought.' })
    .getByRole('button')
    .click();
  await expect(page.locator('article')).toContainText(
    'A fictional first thought.'
  );
  await page
    .getByRole('button', { name: "Today's reflection", exact: true })
    .click();
  await page.getByRole('textbox').fill('A fictional second thought.');
  await save.click();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('listitem').first()).toContainText(
    'A fictional second thought.'
  );
  await expect(page.getByRole('listitem')).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});

test('preserves a failed draft and saves it exactly once on retry', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('A fictional draft to keep.');
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      Storage.prototype.setItem = originalSetItem;
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'could not be saved'
  );
  await expect(page.getByRole('textbox')).toHaveValue(
    'A fictional draft to keep.'
  );
  await expect(page.getByRole('textbox')).toHaveAccessibleDescription(
    /could not be saved/
  );
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'could not be saved'
  );
  await expect(
    page.getByRole('heading', { name: 'Write your share' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share has been saved.' })
  ).toBeFocused();
  await expect(page.locator('article')).toContainText(
    'A fictional draft to keep.'
  );
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Today’s reflection', exact: true })
    .click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('preserves unreadable history instead of overwriting it', async ({
  page
}) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem('doorknob.shares.v1', '{broken')
  );
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'could not be read'
  );
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'could not be read'
  );
  await expect(page.getByText('A place for your words.')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Write your first share' })
  ).toHaveCount(0);
  await page
    .getByRole('main')
    .getByRole('button', { name: "Today's reflection", exact: true })
    .click();

  await page.getByRole('textbox').fill('Another fictional draft.');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'could not be saved'
  );
  expect(
    await page.evaluate(() => localStorage.getItem('doorknob.shares.v1'))
  ).toBe('{broken');
});

test('shows the empty history and retains a draft between views', async ({
  page
}) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('An unfinished fictional draft.');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByText('A place for your words.')).toBeVisible();
  await page.getByRole('button', { name: 'Write your first share' }).click();
  await expect(page.getByRole('textbox')).toHaveValue(
    'An unfinished fictional draft.'
  );
});

test('handles denied browser storage without hiding the draft or claiming empty history', async ({
  page
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access denied', 'SecurityError');
      }
    });
  });
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'could not be read'
  );
  await page.getByRole('textbox').fill('A fictional offline thought.');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'could not be saved'
  );
  await expect(page.getByRole('textbox')).toHaveValue(
    'A fictional offline thought.'
  );
  await expect(
    page.getByRole('heading', { name: 'Write your share' })
  ).toBeVisible();
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'could not be read'
  );
  await expect(
    page.getByRole('button', { name: 'Write your first share' })
  ).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
