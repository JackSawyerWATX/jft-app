import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readPublicShare } from '../../src/shares/server/public-shares';
import { InMemoryShareRepository } from '../../src/shares/server/repository';
import { dispatch } from '../../src/shares/server/app';
import { reflection } from '../../src/shares/reflection-fixture';

const now = 1_800_000_000;
function request(
  path: string,
  method = 'GET',
  cookie?: string,
  headers?: HeadersInit
) {
  const supplied = new Headers(headers);
  if (cookie) supplied.set('cookie', cookie);
  return dispatch(
    new Request(`http://localhost${path}`, { method, headers: supplied })
  );
}
async function create() {
  const response = await dispatch(
    new Request('http://localhost/api/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'A fictional thought shared intentionally.'
      })
    })
  );
  return {
    share: await response.json(),
    cookie: response.headers.get('set-cookie')!.split(';')[0]
  };
}

test('public service validates UUIDs before lookup and enforces seven days from stored creation time', async (t) => {
  t.mock.method(Date, 'now', () => now * 1000);
  const store = new InMemoryShareRepository();
  const saved = await store.create(
    randomUUID(),
    'Fictional public service text.'
  );
  const lookup = t.mock.method(store, 'findById');
  assert.equal(await readPublicShare('invalid', store, now * 1000), null);
  assert.equal(lookup.mock.callCount(), 0);
  assert.deepEqual(await readPublicShare(saved.id, store, now * 1000), {
    reflection,
    text: saved.text
  });
  const boundary = Date.parse(saved.createdAt) + 7 * 24 * 60 * 60 * 1000;
  assert.ok(await readPublicShare(saved.id, store, boundary - 1));
  assert.equal(await readPublicShare(saved.id, store, boundary), null);
  assert.equal(await readPublicShare(saved.id, store, boundary + 1), null);
  assert.equal(await readPublicShare(saved.id, store, now * 1000 - 1), null);
  assert.equal(await readPublicShare(saved.id, store, NaN), null);
  assert.equal(
    await readPublicShare(saved.id, new InMemoryShareRepository(), now * 1000),
    null
  );
  const detached = await store.findById(saved.id);
  detached!.createdAt = new Date(boundary).toISOString();
  assert.equal(await readPublicShare(saved.id, store, boundary), null);
});

test('saving creates one reusable UUID URL; public reads have no session side effects', async (t) => {
  let currentTime = now * 1000;
  t.mock.method(Date, 'now', () => currentTime);
  const { share, cookie } = await create();
  const foreign = await create();
  assert.equal(share.shareUrl, `/s/${share.id}`);
  assert.match(
    share.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  const listed = await (await request('/api/shares', 'GET', cookie)).json();
  assert.equal(listed[0].shareUrl, share.shareUrl);
  const crossOrigin = await dispatch(
    new Request('http://localhost/api/shares', {
      method: 'POST',
      headers: { origin: 'https://elsewhere.example' }
    })
  );
  assert.equal(crossOrigin.status, 403);
  const publicPath = `/api/public/shares/${share.id}`;
  for (const credential of [
    undefined,
    'doorknob-session=invalid',
    foreign.cookie
  ]) {
    const result = await request(publicPath, 'GET', credential);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { reflection, text: share.text });
    assert.equal(result.headers.get('set-cookie'), null);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
  }
  assert.equal(
    (await request(`/api/shares/${share.id}`, 'GET', foreign.cookie)).status,
    404
  );
  assert.deepEqual(
    await (await request(`/api/shares/${share.id}`, 'GET', cookie)).json(),
    share
  );
  const head = await request(publicPath, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const broken of [
    '/api/public/shares/invalid',
    publicPath.replace(share.id, randomUUID())
  ]) {
    const invalid = await request(broken);
    assert.equal(invalid.status, 404);
    assert.deepEqual(await invalid.json(), {
      error: { code: 'SHARE_NOT_FOUND', message: 'Share not found.' }
    });
    assert.equal(invalid.headers.get('set-cookie'), null);
    assert.equal(invalid.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
  currentTime = (now + 604800) * 1000;
  for (const path of [
    publicPath,
    publicPath + '?expires=9999999999999999',
    publicPath + '?createdAt=2099-01-01'
  ]) {
    const expired = await request(path);
    assert.equal(expired.status, 404);
    assert.equal(expired.headers.get('set-cookie'), null);
  }
});

test('repository failures propagate without returning content', async (t) => {
  const store = new InMemoryShareRepository();
  t.mock.method(store, 'findById', async () => {
    throw new Error('Fictional repository failure');
  });
  await assert.rejects(
    readPublicShare(randomUUID(), store),
    /Fictional repository failure/
  );
});
