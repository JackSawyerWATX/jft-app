import { expect, test } from '@playwright/test';

test('a stale prototype cookie automatically starts an empty session and allows saving', async ({
  page,
  context,
  baseURL
}) => {
  await context.addCookies([
    {
      name: 'doorknob-session',
      value: 'fictional-stale-cookie',
      url: baseURL!,
      httpOnly: true
    }
  ]);
  await page.goto('/');
  await page
    .getByRole('textbox')
    .fill('A fictional draft after restarting the prototype.');
  await expect(
    page.getByRole('button', { name: 'Save privately' })
  ).toBeEnabled();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Start a new session' })
  ).toHaveCount(0);
  const cookie = (await context.cookies()).find(
    (item) => item.name === 'doorknob-session'
  );
  expect(cookie?.value).not.toBe('fictional-stale-cookie');
  await page.getByRole('button', { name: 'Save privately' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your share is saved.' })
  ).toBeVisible();
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Past shares', exact: true })
    .click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
});
