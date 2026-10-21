import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

// A test-only repository fails once in an isolated production process, then lets retry recover.
test('server failures use a retryable error page and sanitized diagnostics', async ({
  page
}, testInfo) => {
  const base = `http://127.0.0.1:${3300 + testInfo.parallelIndex}`;
  const server = spawn(
    process.execPath,
    [
      '--import',
      resolve('tests/e2e/fixtures/retryable-repository.mjs'),
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(3300 + testInfo.parallelIndex)
    ],
    {
      env: {
        ...process.env,
        SESSION_SECRET: 'fictional-error-test-session-key-at-least-32-bytes'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  let output = '';
  server.stdout?.on('data', (data: Buffer) => {
    output += data.toString();
  });
  server.stderr?.on('data', (data: Buffer) => {
    output += data.toString();
  });
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(base)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 10000 }
      )
      .toBe(200);
    const response = await page.goto(
      `${base}/s/95eff0e1-bca7-4fd1-83d2-42ba330aab22`
    );
    expect(response?.status()).toBe(500);
    await expect(
      page.getByRole('heading', {
        name: 'This share could not be loaded',
        exact: true
      })
    ).toBeVisible();
    await expect(
      page.getByText('This share is unavailable', { exact: true })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Write your share' })
    ).toHaveAttribute('href', '/');
    expect(await page.context().cookies()).toEqual([]);
    await expect
      .poll(() => output)
      .toContain('The shared reflection could not be loaded.');
    expect(output).not.toContain('95eff0e1-bca7-4fd1-83d2-42ba330aab22');
    expect(output).not.toContain('Fictional raw repository failure');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.getByRole('heading', { name: 'This share is unavailable' })
    ).toBeVisible();
    expect(await page.context().cookies()).toEqual([]);
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGKILL');
      await exited;
    }
  }
});
