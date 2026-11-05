import { test as base, expect, type Page } from '@playwright/test';
import {
  browserErrorCategory,
  type ExpectedBrowserError
} from './browser-errors';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

export const test = base.extend<{
  expectedBrowserErrors: ExpectedBrowserError[];
  watchPage: (page: Page) => void;
  browserGuard: void;
}>({
  expectedBrowserErrors: [[], { option: true }],
  watchPage: async ({ expectedBrowserErrors }, provide) => {
    const errors: string[] = [];
    const watched = new Set<Page>();
    await provide((page) => {
      if (watched.has(page)) return;
      watched.add(page);
      const failedHttp = new Set<string>();
      page.on('response', (response) => {
        if (
          response.status() >= 400 &&
          ['document', 'fetch', 'xhr'].includes(
            response.request().resourceType()
          )
        )
          failedHttp.add(`${response.url()}|${response.status()}`);
      });
      page.on('pageerror', (error) => {
        const category = browserErrorCategory(
          'pageerror',
          error.message,
          expectedBrowserErrors
        );
        if (category) errors.push(category);
      });
      page.on('console', (message) => {
        const text = message.text();
        if (
          message.type() !== 'error' &&
          !(message.type() === 'warning' && /hydrat|did not match/i.test(text))
        )
          return;
        const status = text.match(
          /^Failed to load resource: the server responded with a status of ([45]\d\d)\b/
        )?.[1];
        const url = message.location().url;
        const observedHttpFailure = Boolean(
          status &&
          (url
            ? failedHttp.has(`${url}|${status}`)
            : [...failedHttp].some((entry) => entry.endsWith(`|${status}`)))
        );
        const category = browserErrorCategory(
          'console',
          text,
          expectedBrowserErrors,
          observedHttpFailure
        );
        if (category) errors.push(category);
      });
    });
    expect(
      errors,
      'Unexpected browser diagnostics (messages redacted)'
    ).toEqual([]);
  },
  browserGuard: [
    async ({ context, watchPage }, provide) => {
      context.pages().forEach(watchPage);
      context.on('page', watchPage);
      // Never make a real provider call from a browser test. Page-level mocks take precedence.
      await context.route(/^https:\/\/api\.openai\.com\//, async (route) => {
        await route.abort();
        throw new Error(
          'Unmocked provider request: browser tests must use synthetic mocks'
        );
      });
      await provide();
      context.off('page', watchPage);
    },
    { auto: true }
  ]
});
