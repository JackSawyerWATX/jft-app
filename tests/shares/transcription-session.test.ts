import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { dispatch } from '../../src/shares/server/app';
import { issueTranscriptionCredential } from '../../src/shares/server/providers/openai/session';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { openAIKey } from '../../src/shares/server/providers/openai/key';

const environments = new WeakSet<TestContext>();
function setEnv(t: TestContext, name: string, value: string) {
  if (!environments.has(t)) {
    t.mock.property(process, 'env', { ...process.env });
    environments.add(t);
  }
  process.env[name] = value;
}

async function cookie() {
  const response = await dispatch(new Request('http://localhost/api/shares'));
  return response.headers.get('set-cookie')!.split(';')[0];
}
const request = (headers: HeadersInit) =>
  dispatch(
    new Request('http://localhost/api/transcription/session', {
      method: 'POST',
      headers
    })
  );

test('credential issuance requires exact origin and a previously signed session; never issues cookies', async () => {
  const rejectedHeaders: HeadersInit[] = [
    {},
    { origin: 'https://foreign.example' },
    { origin: 'http://localhost', cookie: 'doorknob-session=forged' }
  ];
  for (const headers of rejectedHeaders) {
    const response = await request(headers);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});

test('disabled and missing-key configurations fail closed without exposing details', async (t) => {
  setEnv(t, 'STT_ENABLED', 'false');
  const headers = { origin: 'http://localhost', cookie: await cookie() };
  assert.equal((await request(headers)).status, 503);
  setEnv(t, 'STT_ENABLED', 'true');
  setEnv(t, 'STT_OPENAI_API_KEY', '');
  setEnv(t, 'STT_OPENAI_SECRET_ARN', '');
  const response = await request(headers);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('API_KEY'));
});

test('OpenAI SDK requests fixed transcription settings and returns only ephemeral fields', async (t) => {
  setEnv(t, 'STT_ENABLED', 'true');
  setEnv(t, 'STT_OPENAI_API_KEY', 'fictional-permanent-key');
  const calls: Request[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      calls.push(req);
      return Response.json({
        value: 'fictional-ephemeral',
        expires_at: 123,
        session: { secret: 'not-for-browser' }
      });
    }
  );
  const headers = { origin: 'http://localhost', cookie: await cookie() };
  const response = await request(headers);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    value: 'fictional-ephemeral',
    expires_at: 123
  });
  const body = await calls[0].json();
  assert.equal(
    calls[0].url,
    'https://api.openai.com/v1/realtime/client_secrets'
  );
  assert.equal(
    calls[0].headers.get('authorization'),
    'Bearer fictional-permanent-key'
  );
  assert.equal(body.session.type, 'transcription');
  assert.equal(
    body.session.audio.input.transcription.model,
    'gpt-live-transcribe'
  );
  assert.equal(body.session.audio.input.turn_detection, null);
  assert.equal(body.expires_after.seconds, 60);
  for (let i = 0; i < 4; i++)
    assert.equal((await request(headers)).status, 200);
  const limited = await request(headers);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(calls.length, 5);
});

test('provider failure is sanitized, method handling does not mint credentials, and local key binding is reused', async (t) => {
  setEnv(t, 'STT_ENABLED', 'true');
  setEnv(t, 'STT_OPENAI_API_KEY', 'fictional-key');
  assert.equal(await openAIKey(), 'fictional-key');
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('sensitive provider error');
  });
  await assert.rejects(issueTranscriptionCredential());
  const response = await request({
    origin: 'http://localhost',
    cookie: await cookie()
  });
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('sensitive'));
  const method = await dispatch(
    new Request('http://localhost/api/transcription/session')
  );
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'POST, OPTIONS');
});

test('Amplify runtime secrets are cached after success and failed reads can recover', async (t) => {
  setEnv(t, 'STT_OPENAI_API_KEY', '');
  setEnv(
    t,
    'STT_OPENAI_SECRET_ARN',
    'arn:aws:secretsmanager:us-east-1:123456789012:secret:fictional-cache'
  );
  let reads = 0;
  const send = t.mock.method(
    SecretsManagerClient.prototype,
    'send',
    async () => {
      reads++;
      return { SecretString: 'fictional-aws-key' };
    }
  );
  assert.equal(await openAIKey(), 'fictional-aws-key');
  assert.equal(await openAIKey(), 'fictional-aws-key');
  assert.equal(reads, 1);
  setEnv(
    t,
    'STT_OPENAI_SECRET_ARN',
    'arn:aws:secretsmanager:us-east-1:123456789012:secret:fictional-recover'
  );
  send.mock.mockImplementation(async () => {
    reads++;
    throw new Error('sensitive IAM error');
  });
  await assert.rejects(openAIKey(), { message: 'Secret unavailable' });
  send.mock.mockImplementation(async () => {
    reads++;
    return { SecretString: 'fictional-rotated-key' };
  });
  assert.equal(await openAIKey(), 'fictional-rotated-key');
  assert.equal(reads, 3);
});

test('credential origin checks use the public Host when the internal listener differs', async (t) => {
  setEnv(t, 'STT_ENABLED', 'false');
  const headers = {
    origin: 'https://preview.example',
    host: 'preview.example',
    cookie: await cookie()
  };
  const response = await dispatch(
    new Request('https://internal-listener/api/transcription/session', {
      method: 'POST',
      headers
    })
  );
  assert.equal(response.status, 503);
  const foreign = await dispatch(
    new Request('https://internal-listener/api/transcription/session', {
      method: 'POST',
      headers: { ...headers, origin: 'https://foreign.example' }
    })
  );
  assert.equal(foreign.status, 403);
});

test('browser policy precedes identity checks; authentication configuration failures remain coded and private', async (t) => {
  setEnv(t, 'SESSION_SECRET', 'invalid-short-secret');
  const calls = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Must not contact provider');
  });
  for (const path of ['/api/transcription/session', '/api/shares/cleanup']) {
    const foreign = await dispatch(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { origin: 'https://foreign.example' }
      })
    );
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).error.code, 'CROSS_ORIGIN_REQUEST');
    const same = await dispatch(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { origin: 'http://localhost' }
      })
    );
    assert.equal(same.status, 500);
    assert.equal((await same.json()).error.code, 'INTERNAL_ERROR');
    assert.equal(same.headers.get('set-cookie'), null);
    assert.equal(same.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal(calls.mock.callCount(), 0);
});

test('invalid credential shape never crosses the browser boundary', async (t) => {
  setEnv(t, 'STT_ENABLED', 'true');
  setEnv(t, 'STT_OPENAI_API_KEY', 'fictional-key');
  t.mock.method(console, 'warn', () => {});
  for (const token of [
    { value: '', expires_at: 123 },
    { value: 'private-token', expires_at: '123' },
    { value: 'private-token', expires_at: 123.5 }
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(token));
    const result = await request({
      origin: 'http://localhost',
      cookie: await cookie()
    });
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), {
      error: {
        code: 'TRANSCRIPTION_UNAVAILABLE',
        message:
          'Transcription is unavailable. You can still type and save your share.'
      }
    });
  }
});
