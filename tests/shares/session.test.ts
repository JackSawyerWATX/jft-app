import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSession, setSessionCookie } from '../../src/shares/server/session';

test('typed new-session payloads round-trip through cookies without rolling renewal', async () => {
  const created = await getSession(new Request('http://localhost/api/shares'));
  assert.ok(created.newSession);
  assert.equal(created.newSession.ownerId, created.ownerId);
  const response = new Response();
  await setSessionCookie(response, created.newSession);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const existing = await getSession(
    new Request('http://localhost/api/shares', { headers: { cookie } })
  );
  assert.equal(existing.ownerId, created.ownerId);
  assert.equal(existing.newSession, null);
  const unchanged = new Response();
  await setSessionCookie(unchanged, existing.newSession);
  assert.equal(unchanged.headers.get('set-cookie'), null);
});

test('cookie issuance validates payload fields before signing', async () => {
  const response = new Response();
  await assert.rejects(
    setSessionCookie(response, { ownerId: 'invalid-owner', expiresAt: 1 })
  );
  assert.equal(response.headers.get('set-cookie'), null);
});
