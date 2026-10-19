import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveShare, ShareApiError } from '../../src/shares/api';

test('the fetch client retains stable error codes/status and does not retry failed saves', async (context) => {
  const calls = context.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_SHARE',
            message: 'A fictional validation message.'
          }
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
  );
  await assert.rejects(saveShare('Fictional text.'), (cause: unknown) => {
    assert.ok(cause instanceof ShareApiError);
    assert.equal(cause.code, 'INVALID_SHARE');
    assert.equal(cause.status, 400);
    assert.equal(cause.message, 'A fictional validation message.');
    return true;
  });
  assert.equal(calls.mock.callCount(), 1);
});

test('non-JSON failures retain HTTP status and use a safe fallback without retrying', async (context) => {
  const calls = context.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>Proxy failure</html>', { status: 502 })
  );
  await assert.rejects(saveShare('Fictional text.'), (cause: unknown) => {
    assert.ok(cause instanceof ShareApiError);
    assert.equal(cause.status, 502);
    assert.equal(cause.code, 'INTERNAL_ERROR');
    assert.equal(cause.message, 'Please try again.');
    return true;
  });
  assert.equal(calls.mock.callCount(), 1);
});
