import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserErrorCategory } from '../e2e/fixtures/browser-errors';

test('hydration, uncaught exceptions and arbitrary console errors fail with redacted categories', () => {
  assert.equal(
    browserErrorCategory(
      'console',
      "A tree hydrated but some attributes didn't match. private text",
      []
    ),
    'hydration mismatch'
  );
  assert.equal(
    browserErrorCategory('pageerror', 'private exception details', []),
    'uncaught browser exception'
  );
  assert.equal(
    browserErrorCategory('console', 'private vendor message', []),
    'unexpected console error'
  );
});

test('HTTP resource diagnostics are distinct from broken assets, network failures and JS errors', () => {
  assert.equal(
    browserErrorCategory(
      'console',
      'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      [],
      true
    ),
    undefined
  );
  assert.equal(
    browserErrorCategory(
      'console',
      'Failed to load resource: net::ERR_FAILED',
      []
    ),
    'unexpected console error'
  );
  assert.equal(
    browserErrorCategory(
      'pageerror',
      'Failed to load resource: the server responded with a status of 503',
      []
    ),
    'uncaught browser exception'
  );
});

test('intentional exceptions require matching kind, scoped pattern and an explanation', () => {
  const expected = [
    {
      kind: 'console' as const,
      pattern: /Server Components render/,
      reason: 'Deliberately failed isolated repository.'
    }
  ];
  assert.equal(
    browserErrorCategory(
      'console',
      'An error occurred in the Server Components render.',
      expected
    ),
    undefined
  );
  assert.equal(
    browserErrorCategory(
      'pageerror',
      'An error occurred in the Server Components render.',
      expected
    ),
    'uncaught browser exception'
  );
  assert.equal(
    browserErrorCategory('console', 'Hydration failed', expected),
    'hydration mismatch'
  );
  assert.equal(
    browserErrorCategory(
      'console',
      'An error occurred in the Server Components render.',
      [{ ...expected[0], reason: '' }]
    ),
    'unexpected console error'
  );
});
