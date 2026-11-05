import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSession,
  setSessionCookie
} from '../../src/shares/server/auth/session';

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

test('stale signing keys and expired credentials start fresh owners without trusting their stored owner IDs', async (t) => {
  const { serializeSigned } = await import('hono/utils/cookie');
  const { randomUUID } = await import('node:crypto');
  const { InMemoryShareRepository } =
    await import('../../src/shares/server/storage/repository');
  const now = 1_800_000_000;
  const ownerId = randomUUID();
  const key = 'fictional-current-session-key-at-least-32-bytes';
  t.mock.property(process, 'env', { ...process.env, SESSION_SECRET: key });
  t.mock.method(Date, 'now', () => now * 1000);
  const store = new InMemoryShareRepository();
  const saved = await store.create(ownerId, 'A fictional private record.');
  for (const [expiresAt, signingKey] of [
    [now + 3600, 'fictional-previous-key-at-least-32-bytes'],
    [now - 1, key]
  ] as const) {
    const cookie = await serializeSigned(
      'doorknob-session',
      JSON.stringify({ ownerId, expiresAt }),
      signingKey
    );
    const fresh = await getSession(
      new Request('http://localhost', { headers: { cookie } })
    );
    assert.ok(fresh.newSession);
    assert.notEqual(fresh.ownerId, ownerId);
    assert.deepEqual(await store.listByOwner(fresh.ownerId), []);
    assert.equal(await store.findByOwner(saved.id, fresh.ownerId), null);
    assert.ok(await store.findByOwner(saved.id, ownerId));
  }
});
