import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { dispatch } from '../../src/shares/server/app';
import { cleanDraft } from '../../src/shares/cleanup/api';

function enable(t: TestContext) {
  t.mock.property(process, 'env', {
    ...process.env,
    STT_ENABLED: 'true',
    STT_OPENAI_API_KEY: 'fictional-key'
  });
  return t.mock.method(console, 'warn', () => {});
}
async function cookie() {
  const response = await dispatch(new Request('http://localhost/api/shares'));
  return response.headers.get('set-cookie')!.split(';')[0];
}
function request(
  session?: string,
  body = JSON.stringify({ text: 'Um, a fictional thought. Another thought.' }),
  origin: string | null = 'http://localhost'
) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (session) headers.set('cookie', session);
  if (origin) headers.set('origin', origin);
  return dispatch(
    new Request('http://localhost/api/shares/cleanup', {
      method: 'POST',
      headers,
      body
    })
  );
}
function response(text: string, status = 'completed') {
  return Response.json({
    id: 'resp_fiction',
    object: 'response',
    status,
    output: [
      {
        type: 'message',
        id: 'msg_fiction',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({ text }),
            annotations: []
          }
        ]
      }
    ]
  });
}

test('cleanup requires exact origin, an existing signed session, and explicit enablement', async (t) => {
  enable(t);
  const calls = t.mock.method(globalThis, 'fetch', async () =>
    response('Fiction.')
  );
  assert.equal((await request()).status, 403);
  const session = await cookie();
  assert.equal((await request(session, undefined, null)).status, 403);
  assert.equal(
    (await request(session, undefined, 'https://foreign.example')).status,
    403
  );
  process.env.STT_ENABLED = 'false';
  assert.equal((await request(session)).status, 503);
  assert.equal(calls.mock.callCount(), 0);
});

test('cleanup validates text and bytes before calling OpenAI', async (t) => {
  enable(t);
  const calls = t.mock.method(globalThis, 'fetch', async () =>
    response('Fiction.')
  );
  const session = await cookie();
  for (const body of [
    '{',
    '{}',
    '{"text":" "}',
    '{"text":7}',
    '{"text":"a","extra":true}',
    JSON.stringify({ text: '🌱'.repeat(10_001) })
  ]) {
    assert.equal((await request(session, body)).status, 400);
  }
  assert.equal((await request(session, ' '.repeat(65_537))).status, 413);
  assert.equal(calls.mock.callCount(), 0);
});

test('cleanup uses structured non-stored Responses and does not create shares or cookies', async (t) => {
  enable(t);
  const calls: Request[] = [];
  const cleaned = 'A fictional thought.\n\nAnother thought.';
  t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Request(input, init));
      return response(cleaned);
    }
  );
  const session = await cookie();
  const result = await request(session);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { text: cleaned });
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(result.headers.get('set-cookie'), null);
  const body = await calls[0].json();
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(body.store, false);
  assert.equal(body.model, 'gpt-5.4-mini');
  assert.equal(body.reasoning.effort, 'none');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.input, 'Um, a fictional thought. Another thought.');
  assert.match(body.instructions, /Never summarize/);
  const history = await dispatch(
    new Request('http://localhost/api/shares', { headers: { cookie: session } })
  );
  assert.deepEqual(await history.json(), []);
});

test('empty, oversized, incomplete, refused and failed cleanup never returns a partial replacement', async (t) => {
  const log = enable(t);
  let provider = response('');
  t.mock.method(globalThis, 'fetch', async () => provider);
  for (const invalid of [
    response(''),
    response('🌱'.repeat(10_001)),
    response('Partial', 'incomplete'),
    Response.json({ status: 'completed', output: [] }),
    Response.json({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'refusal', refusal: 'Fictional refusal' }]
        }
      ]
    }),
    Response.json(
      {
        error: { message: 'private provider details', code: 'invalid_api_key' }
      },
      { status: 401 }
    )
  ]) {
    provider = invalid;
    const result = await request(await cookie());
    assert.equal(result.status, 503);
    assert.ok(!(await result.text()).includes('private provider details'));
  }
  assert.deepEqual(
    log.mock.calls.map(
      (call) => (call.arguments[1] as { reason: string }).reason
    ),
    [
      'invalid_cleanup_output',
      'invalid_cleanup_output',
      'cleanup_not_completed',
      'missing_cleanup_output',
      'cleanup_refused',
      'provider_request_failed'
    ]
  );
});

test('cleanup counts Unicode code points and limits repeated paid requests independently', async (t) => {
  enable(t);
  const text = '🌱'.repeat(6_000);
  const calls = t.mock.method(globalThis, 'fetch', async () => response(text));
  const session = await cookie();
  for (let i = 0; i < 5; i++) {
    const result = await request(session, JSON.stringify({ text }));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).text, text);
  }
  const limited = await request(session);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(calls.mock.callCount(), 5);
  const get = await dispatch(
    new Request('http://localhost/api/shares/cleanup')
  );
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST, OPTIONS');
});

test('cleanup client rejects invalid responses and never exposes upstream response bodies', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'private error' }, { status: 503 })
  );
  await assert.rejects(cleanDraft('Fiction.', new AbortController().signal), {
    message: 'Cleanup unavailable'
  });
});

test('shared HTTP handling forwards cleanup cancellation without retrying or swallowing aborts', async (t) => {
  const controller = new AbortController();
  let received: AbortSignal | null | undefined;
  const calls = t.mock.method(
    globalThis,
    'fetch',
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      received = init?.signal;
      return new Promise<Response>((_resolve, reject) =>
        received?.addEventListener(
          'abort',
          () => reject(new DOMException('Canceled', 'AbortError')),
          { once: true }
        )
      );
    }
  );
  const request = cleanDraft('Fictional draft.', controller.signal);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(received, controller.signal);
  assert.equal(calls.mock.callCount(), 1);
});
