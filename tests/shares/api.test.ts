import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { serializeSigned } from 'hono/utils/cookie';
import { NextRequest } from 'next/server';
import { GET, POST } from '../../src/app/api/shares/route';
import { GET as getDetail } from '../../src/app/api/shares/[id]/route';
import { reflection } from '../../src/shares/reflection-fixture';
import { shareRepository } from '../../src/shares/server/repository';

function request(method = 'GET', cookie?: string, body?: unknown) {
  return new NextRequest('http://localhost/api/shares', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}
function cookieFrom(response: Response) {
  return response.headers.get('set-cookie')!.split(';')[0];
}
async function session() {
  return cookieFrom(await GET(request()));
}
async function detail(id: string, cookie?: string) {
  return getDetail(
    new NextRequest(`http://localhost/api/shares/${id}`, {
      headers: cookie ? { cookie } : {}
    })
  );
}

test('creates validated shares with server metadata and retrieves them across requests', async () => {
  const before = Date.now();
  const response = await POST(
    request('POST', undefined, { text: '  A fictional thought.  ' })
  );
  assert.equal(response.status, 201);
  const share = await response.json();
  const cookie = cookieFrom(response);
  assert.match(cookie, /^doorknob-session=/);
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/i);
  assert.match(response.headers.get('set-cookie')!, /SameSite=lax/i);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(share.id, /^[0-9a-f-]{36}$/);
  assert.ok(
    Date.parse(share.createdAt) >= before &&
      Date.parse(share.createdAt) <= Date.now()
  );
  assert.equal(share.text, 'A fictional thought.');
  assert.equal(share.kind, 'text');
  assert.deepEqual(share.reflection, reflection);
  assert.equal('ownerId' in share, false);
  assert.deepEqual(await (await detail(share.id, cookie)).json(), share);
  const second = await (
    await POST(request('POST', cookie, { text: 'Another fictional thought.' }))
  ).json();
  assert.notEqual(second.id, share.id);
  assert.deepEqual(await (await GET(request('GET', cookie))).json(), [
    second,
    share
  ]);
});

test('rejects empty input, malformed JSON, wrong types and authoritative client fields', async () => {
  for (const body of [
    { text: '' },
    { text: ' \n ' },
    {},
    null,
    { text: 42 },
    { text: 'ok', ownerId: randomUUID() },
    { text: 'ok', id: randomUUID() },
    { text: 'ok', createdAt: '2025-01-01T00:00:00Z' },
    { text: 'ok', reflection }
  ]) {
    const response = await POST(request('POST', undefined, body));
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error.message, 'string');
  }
  const malformed = new NextRequest('http://localhost/api/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{'
  });
  assert.equal((await POST(malformed)).status, 400);
  const wrongType = new NextRequest('http://localhost/api/shares', {
    method: 'POST',
    body: 'text'
  });
  assert.equal((await POST(wrongType)).status, 415);
});

test('returns 404 for nonexistent and other owners shares; isolates anonymous sessions', async () => {
  const first = await session();
  const second = await session();
  assert.notEqual(first, second);
  const created = await (
    await POST(request('POST', first, { text: 'Private fictional thought.' }))
  ).json();
  assert.deepEqual(await (await GET(request('GET', second))).json(), []);
  const missing = await detail(randomUUID(), first);
  const otherOwner = await detail(created.id, second);
  assert.equal(missing.status, 404);
  assert.equal(otherOwner.status, 404);
  assert.deepEqual(await otherOwner.json(), await missing.json());
  assert.equal((await detail(created.id)).status, 404);
});

test('replaces unusable session cookies with isolated fresh owners', async () => {
  const valid = await session();
  const credential = decodeURIComponent(valid.slice(valid.indexOf('=') + 1));
  for (const forged of [
    '',
    randomUUID(),
    'garbage',
    credential.replace(/.$/, '!'),
    credential.replace('ownerId', 'forgedId'),
    credential + '.extra'
  ]) {
    const cookie = `doorknob-session=${encodeURIComponent(forged)}`;
    const fresh = await GET(request('GET', cookie));
    assert.equal(fresh.status, 200);
    assert.ok(fresh.headers.get('set-cookie'));
    assert.deepEqual(await fresh.json(), []);
    assert.equal(
      (await POST(request('POST', cookie, { text: 'Fictional thought.' })))
        .status,
      201
    );
    assert.equal((await detail(randomUUID(), cookie)).status, 404);
  }
});

test('replaces a supplied cookie that the library cannot parse', async () => {
  assert.equal(
    (await GET(request('GET', 'doorknob-session=invalid"value'))).status,
    200
  );
});

test('rejects cross-origin writes', async () => {
  const req = new NextRequest('http://localhost/api/shares', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://elsewhere.example'
    },
    body: JSON.stringify({ text: 'Fictional thought.' })
  });
  assert.equal((await POST(req)).status, 403);
});

test('repository enforces ownership and returns independent snapshots', async () => {
  const owner = randomUUID();
  const other = randomUUID();
  const created = await shareRepository.create(owner, 'Fictional thought.');
  created.reflection.title = 'Changed';
  assert.equal(
    (await shareRepository.findByOwner(created.id, owner))?.reflection.title,
    reflection.title
  );
  assert.equal(await shareRepository.findByOwner(created.id, other), null);
  assert.deepEqual(await shareRepository.listByOwner(other), []);
});

test('production cookies are Secure and an expired cookie starts a fresh owner', async (context) => {
  const secret = 'fictional-unit-test-secret-at-least-32-bytes';
  context.mock.property(process, 'env', {
    ...process.env,
    NODE_ENV: 'production',
    SESSION_SECRET: secret
  });
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /; Secure/i);
  assert.match(response.headers.get('set-cookie')!, /Max-Age=2592000/i);
  const expired = await serializeSigned(
    'doorknob-session',
    JSON.stringify({
      ownerId: randomUUID(),
      expiresAt: Math.floor(Date.now() / 1000) - 1
    }),
    secret
  );
  assert.equal((await GET(request('GET', expired))).status, 200);
  delete process.env.SESSION_SECRET;
  assert.equal((await GET(request())).status, 500);
  process.env.SESSION_SECRET = 'too-short';
  assert.equal((await GET(request())).status, 500);
});

test('accepts same-origin requests when the listening hostname differs from Host', async () => {
  const req = new NextRequest('http://0.0.0.0:3100/api/shares', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: '127.0.0.1:3100',
      origin: 'http://127.0.0.1:3100'
    },
    body: JSON.stringify({ text: 'Fictional browser-facing origin.' })
  });
  assert.equal((await POST(req)).status, 201);
});

test('validates signed JSON payloads before trusting session ownership', async (context) => {
  const secret = 'fictional-parser-test-secret-at-least-32-bytes';
  context.mock.property(process, 'env', {
    ...process.env,
    SESSION_SECRET: secret
  });
  const payload = {
    ownerId: randomUUID(),
    expiresAt: Math.floor(Date.now() / 1000) + 3600
  };
  const valid = await serializeSigned(
    'doorknob-session',
    JSON.stringify(payload),
    secret
  );
  const response = await GET(request('GET', valid));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  for (const value of [
    'invalid JSON',
    JSON.stringify(null),
    JSON.stringify({ ...payload, ownerId: 'forged' }),
    ...['', 0, -1, 1.5, '1e10', Number.MAX_SAFE_INTEGER + 1].map((expiresAt) =>
      JSON.stringify({ ...payload, expiresAt })
    ),
    JSON.stringify({ ...payload, extra: true })
  ]) {
    const cookie = await serializeSigned('doorknob-session', value, secret);
    const fresh = await GET(request('GET', cookie));
    assert.equal(fresh.status, 200);
    assert.ok(fresh.headers.get('set-cookie'));
    assert.deepEqual(await fresh.json(), []);
  }
});

test('foreign-origin form writes never establish or replace a session', async () => {
  for (const cookie of [
    undefined,
    await session(),
    'doorknob-session=forged'
  ]) {
    const response = await POST(
      new NextRequest('http://localhost/api/shares', {
        method: 'POST',
        headers: {
          origin: 'https://foreign.example',
          'content-type': 'application/x-www-form-urlencoded',
          ...(cookie ? { cookie } : {})
        },
        body: 'text=A+fictional+cross-site+form'
      })
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await response.json()).error.code, 'CROSS_ORIGIN_REQUEST');
  }
});
