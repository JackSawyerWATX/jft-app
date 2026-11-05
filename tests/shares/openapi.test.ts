import { test } from 'node:test';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3_1 } from 'openapi-types';
import Ajv2020, { type AnySchema } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { dispatch, getOpenApiDocument } from '../../src/shares/server/app';
import { MAX_SHARE_TEXT_LENGTH } from '../../src/shares/model';
import { MAX_SHARE_REQUEST_BYTES } from '../../src/shares/server/http/errors';
import {
  collectionAllow,
  detailAllow
} from '../../src/shares/server/http/resource-methods';

function request(
  method = 'GET',
  path = '/api/shares',
  cookie?: string,
  body?: string,
  extraHeaders?: HeadersInit
) {
  const headers = new Headers(extraHeaders);
  if (cookie) headers.set('cookie', cookie);
  if (body !== undefined && !headers.has('content-type'))
    headers.set('content-type', 'application/json');
  return dispatch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body })
    })
  );
}
function cookieFrom(response: Response) {
  return response.headers.get('set-cookie')!.split(';')[0];
}
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
let documented: OpenAPIV3_1.Document;
async function contract(
  response: Response,
  path = '/api/shares',
  method: 'get' | 'post' | 'head' | 'options' = 'get'
) {
  documented ??= (await SwaggerParser.validate(
    JSON.parse(JSON.stringify(getOpenApiDocument())),
    { resolve: { external: false } }
  )) as OpenAPIV3_1.Document;
  const operation = documented.paths?.[path]?.[method];
  assert.ok(operation, `${method} ${path} is documented`);
  const expected = operation.responses?.[response.status];
  assert.ok(
    expected && !('$ref' in expected),
    `documented status ${response.status}`
  );
  for (const [name, header] of Object.entries(expected.headers ?? {})) {
    assert.ok(!('$ref' in header));
    const actual = response.headers.get(name);
    if (header.required)
      assert.notEqual(actual, null, `required header ${name}`);
    if (actual !== null && header.schema)
      assert.equal(
        ajv.validate(header.schema as AnySchema, actual),
        true,
        JSON.stringify(ajv.errors)
      );
  }
  if (method === 'head' || response.status === 204) {
    assert.equal(await response.text(), '');
    assert.equal(expected.content, undefined);
    return;
  }
  assert.ok(
    response.headers.get('content-type')?.startsWith('application/json')
  );
  const schema = expected.content?.['application/json'].schema;
  assert.ok(schema);
  const body: unknown = await response.json();
  assert.equal(
    ajv.validate(schema as AnySchema, body),
    true,
    JSON.stringify(ajv.errors)
  );
}

test('OpenAPI 3.1 is valid and exposes the same contract over HTTP without issuing a session', async () => {
  const document = getOpenApiDocument();
  await SwaggerParser.validate(JSON.parse(JSON.stringify(document)), {
    resolve: { external: false }
  });
  assert.equal(document.openapi, '3.1.0');
  const create = document.components?.schemas?.CreateShare;
  assert.ok(create && !('$ref' in create));
  assert.equal(create.additionalProperties, false);
  const text = create.properties?.text;
  assert.ok(text && !('$ref' in text));
  assert.equal(text.maxLength, MAX_SHARE_TEXT_LENGTH);
  assert.deepEqual(document.paths?.['/api/shares']?.get?.security, [
    { AnonymousSession: [] },
    {}
  ]);
  const security = document.components?.securitySchemes?.AnonymousSession;
  assert.ok(security && !('$ref' in security));
  assert.equal(security.type, 'apiKey');
  const response = await request('GET', '/api/openapi.json');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), JSON.parse(JSON.stringify(document)));
});

test('actual create/list/detail and error responses conform to OpenAPI, including required headers', async () => {
  const session = await request();
  const cookie = cookieFrom(session);
  await contract(session);
  const created = await request(
    'POST',
    '/api/shares',
    cookie,
    JSON.stringify({ text: 'A fictional contract thought.' }),
    { 'Content-Type': 'Application/JSON; Charset="UTF-8"' }
  );
  assert.equal(created.status, 201);
  const share = await created.clone().json();
  assert.equal(created.headers.get('Location'), `/api/shares/${share.id}`);
  assert.equal('ownerId' in share, false);
  await contract(created, '/api/shares', 'post');
  await contract(
    await request('GET', `/api/shares/${share.id}`, cookie),
    '/api/shares/{id}'
  );
  await contract(await request('GET', '/api/shares', cookie));
  await contract(
    await request('GET', `/api/shares/${share.id}`),
    '/api/shares/{id}'
  );
  await contract(
    await request('POST', '/api/shares', cookie, '{'),
    '/api/shares',
    'post'
  );
  await contract(
    await request('POST', '/api/shares', cookie, JSON.stringify({ text: ' ' })),
    '/api/shares',
    'post'
  );
  await contract(
    await request('POST', '/api/shares', cookie, '{}', {
      origin: 'https://foreign.example'
    }),
    '/api/shares',
    'post'
  );
  await contract(
    await request('POST', '/api/shares', cookie, '{}', {
      'content-type': 'text/plain'
    }),
    '/api/shares',
    'post'
  );
  const invalid = await request(
    'GET',
    '/api/shares',
    'doorknob-session=forged'
  );
  assert.equal(invalid.status, 200);
  assert.equal(invalid.headers.get('WWW-Authenticate'), null);
  assert.ok(invalid.headers.get('set-cookie'));
  await contract(invalid);
});

test('text and raw-body limits accept boundaries and reject oversized bytes without writing', async () => {
  const cookie = cookieFrom(await request());
  const max = await request(
    'POST',
    '/api/shares',
    cookie,
    JSON.stringify({ text: 'a'.repeat(MAX_SHARE_TEXT_LENGTH) })
  );
  assert.equal(max.status, 201);
  await contract(max, '/api/shares', 'post');
  const tooLong = await request(
    'POST',
    '/api/shares',
    cookie,
    JSON.stringify({ text: 'a'.repeat(MAX_SHARE_TEXT_LENGTH + 1) })
  );
  assert.equal(tooLong.status, 400);
  assert.equal((await tooLong.clone().json()).error.code, 'INVALID_SHARE');
  await contract(tooLong, '/api/shares', 'post');
  const raw = JSON.stringify({ text: 'Fictional byte boundary.' });
  const boundary = raw.padEnd(MAX_SHARE_REQUEST_BYTES, ' ');
  assert.equal(
    (await request('POST', '/api/shares', cookie, boundary)).status,
    201
  );
  const over = await request('POST', '/api/shares', cookie, boundary + ' ', {
    'content-length': '1'
  });
  assert.equal(over.status, 413);
  assert.equal((await over.clone().json()).error.code, 'PAYLOAD_TOO_LARGE');
  await contract(over, '/api/shares', 'post');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(boundary));
      controller.enqueue(new Uint8Array([32]));
      controller.close();
    }
  });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    body: stream,
    duplex: 'half',
    headers: { cookie, 'content-type': 'application/json' }
  };
  assert.equal(
    (await dispatch(new Request('http://localhost/api/shares', init))).status,
    413
  );
  assert.equal(
    (await (await request('GET', '/api/shares', cookie)).json()).length,
    2
  );
});

test('HEAD enforces ownership/session rules with no bodies; OPTIONS and 405 advertise Allow', async () => {
  const cookie = cookieFrom(await request());
  const created = await (
    await request(
      'POST',
      '/api/shares',
      cookie,
      JSON.stringify({ text: 'A fictional HEAD thought.' })
    )
  ).json();
  for (const [path, specPath, allow] of [
    ['/api/shares', '/api/shares', collectionAllow],
    [`/api/shares/${created.id}`, '/api/shares/{id}', detailAllow]
  ]) {
    const head = await request('HEAD', path, cookie);
    assert.equal(head.status, 200);
    await contract(head, specPath, 'head');
    const unauthorized = await request('HEAD', path, 'doorknob-session=forged');
    assert.equal(unauthorized.status, path === '/api/shares' ? 200 : 404);
    await contract(unauthorized, specPath, 'head');
    const options = await request('OPTIONS', path, 'doorknob-session=forged');
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('Allow'), allow);
    assert.equal(options.headers.get('Set-Cookie'), null);
    assert.equal(options.headers.get('Access-Control-Allow-Origin'), null);
    await contract(options, specPath, 'options');
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const rejected = await request(method, path);
      assert.equal(rejected.status, 405);
      assert.equal(rejected.headers.get('Allow'), allow);
      assert.equal(rejected.headers.get('Set-Cookie'), null);
      assert.deepEqual(await rejected.json(), {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'This HTTP method is not supported for this resource.'
        }
      });
      assert.equal(rejected.headers.get('Cache-Control'), 'private, no-store');
    }
  }
  const missing = await request('HEAD', `/api/shares/${created.id}`);
  assert.equal(missing.status, 404);
  await contract(missing, '/api/shares/{id}', 'head');
  const wrongPost = await request(
    'POST',
    `/api/shares/${created.id}`,
    undefined,
    '{}'
  );
  assert.equal(wrongPost.status, 405);
  assert.equal((await wrongPost.json()).error.code, 'METHOD_NOT_ALLOWED');
  assert.equal(wrongPost.headers.get('Allow'), detailAllow);
});

test('the text limit counts Unicode code points consistently with OpenAPI maxLength', async () => {
  const cookie = cookieFrom(await request());
  const text = '🌱'.repeat(MAX_SHARE_TEXT_LENGTH);
  const accepted = await request(
    'POST',
    '/api/shares',
    cookie,
    JSON.stringify({ text })
  );
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.clone().json()).text, text);
  await contract(accepted, '/api/shares', 'post');
  const rejected = await request(
    'POST',
    '/api/shares',
    cookie,
    JSON.stringify({ text: text + '🌱' })
  );
  assert.equal(rejected.status, 400);
  await contract(rejected, '/api/shares', 'post');
});

test('internal failures retain the generic coded envelope and do not issue cookies', async (context) => {
  context.mock.property(process, 'env', {
    ...process.env,
    NODE_ENV: 'production',
    SESSION_SECRET: 'too-short'
  });
  const failed = await request();
  assert.equal(failed.status, 500);
  assert.equal((await failed.clone().json()).error.code, 'INTERNAL_ERROR');
  assert.equal(failed.headers.get('set-cookie'), null);
  await contract(failed);
});

test('error contracts reject codes belonging to a different HTTP status', async () => {
  await assert.rejects(
    contract(
      Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Fictional error.' } },
        {
          status: 404,
          headers: {
            'Cache-Control': 'private, no-store'
          }
        }
      ),
      '/api/shares/{id}',
      'get'
    )
  );
});

test('save-time link and public responses conform to generated contracts', async () => {
  const created = await request(
    'POST',
    '/api/shares',
    undefined,
    JSON.stringify({ text: 'A fictional shared contract thought.' })
  );
  const saved = await created.clone().json();
  await contract(created, '/api/shares', 'post');
  const publicPath = `/api/public/shares/${saved.id}`;
  await contract(await request('GET', publicPath), '/api/public/shares/{id}');
  await contract(
    await request('HEAD', publicPath),
    '/api/public/shares/{id}',
    'head'
  );
  await contract(
    await request('GET', '/api/public/shares/invalid'),
    '/api/public/shares/{id}'
  );
  await contract(
    await request('OPTIONS', publicPath),
    '/api/public/shares/{id}',
    'options'
  );
});

test('paid operations share documented errors, origin requirements, expiry and retry headers', async (t) => {
  t.mock.property(process, 'env', {
    ...process.env,
    STT_ENABLED: 'true',
    STT_OPENAI_API_KEY: 'fictional-key'
  });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      value: 'ephemeral-fiction',
      expires_at: 123,
      ignored: 'private provider metadata'
    })
  );
  const document = getOpenApiDocument();
  for (const name of ['ApiError', 'DraftText', 'TranscriptionCredential'])
    assert.ok(document.components?.schemas?.[name]);
  const credential = document.components?.schemas?.TranscriptionCredential;
  assert.ok(credential && !('$ref' in credential));
  const expiry = credential.properties?.expires_at;
  assert.ok(expiry && !('$ref' in expiry));
  assert.equal(expiry.type, 'integer');
  assert.match(expiry.description!, /Unix time in seconds/);
  for (const path of ['/api/transcription/session', '/api/shares/cleanup']) {
    const post = document.paths?.[path]?.post;
    assert.deepEqual(post?.security, [{ AnonymousSession: [] }]);
    assert.ok(
      post?.parameters?.some(
        (parameter) =>
          !('$ref' in parameter) &&
          parameter.in === 'header' &&
          parameter.name === 'origin' &&
          parameter.required
      )
    );
    for (const origin of [undefined, 'https://foreign.example']) {
      const response = await request(
        'POST',
        path,
        undefined,
        undefined,
        origin ? { origin } : undefined
      );
      assert.equal(
        (await response.clone().json()).error.code,
        'CROSS_ORIGIN_REQUEST'
      );
      assert.equal(response.headers.get('set-cookie'), null);
      await contract(response, path, 'post');
    }
    const absent = await request('POST', path, undefined, undefined, {
      origin: 'http://localhost'
    });
    assert.equal((await absent.clone().json()).error.code, 'SESSION_REQUIRED');
    await contract(absent, path, 'post');
  }
  const cookie = cookieFrom(await request());
  for (let attempt = 0; attempt < 5; attempt++) {
    const issued = await request(
      'POST',
      '/api/transcription/session',
      cookie,
      undefined,
      { origin: 'http://localhost' }
    );
    assert.equal(issued.status, 200);
    await contract(issued, '/api/transcription/session', 'post');
  }
  const limited = await request(
    'POST',
    '/api/transcription/session',
    cookie,
    undefined,
    { origin: 'http://localhost' }
  );
  assert.equal((await limited.clone().json()).error.code, 'RATE_LIMITED');
  await contract(limited, '/api/transcription/session', 'post');
  // A separate allowance: exhausted credential issuance must not block cleanup.
  for (let attempt = 0; attempt < 5; attempt++) {
    const failedCleanup = await request(
      'POST',
      '/api/shares/cleanup',
      cookie,
      JSON.stringify({ text: 'Fictional draft.' }),
      { origin: 'http://localhost' }
    );
    assert.equal(failedCleanup.status, 503); // Credential-shaped mock is intentionally invalid cleanup output.
    await contract(failedCleanup, '/api/shares/cleanup', 'post');
  }
  const cleanupLimited = await request(
    'POST',
    '/api/shares/cleanup',
    cookie,
    JSON.stringify({ text: 'Fictional draft.' }),
    { origin: 'http://localhost' }
  );
  assert.equal(cleanupLimited.status, 429);
  await contract(cleanupLimited, '/api/shares/cleanup', 'post');
  process.env.STT_ENABLED = 'false';
  for (const path of ['/api/transcription/session', '/api/shares/cleanup']) {
    const unavailable = await request('POST', path, cookie, undefined, {
      origin: 'http://localhost'
    });
    assert.equal(unavailable.status, 503);
    await contract(unavailable, path, 'post');
  }
  await contract(
    await request('OPTIONS', '/api/transcription/session'),
    '/api/transcription/session',
    'options'
  );
});
