import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SecretsManagerClient,
  GetSecretValueCommand
} from '@aws-sdk/client-secrets-manager';
import { sonioxKey } from '../../src/shares/server/providers/soniox/key';
import { issueSonioxCredential } from '../../src/shares/server/providers/soniox/session';
import { reportTranscriptionFailure } from '../../src/shares/server/transcription-provider';

test('Soniox credential policy is realtime-only, single-use and bounded; response contains no permanent key', async () => {
  let body: unknown;
  const issued = await issueSonioxCredential(
    new AbortController().signal,
    async (url, options) => {
      assert.equal(url, 'https://api.soniox.com/v1/auth/temporary-api-key');
      assert.equal(
        (options?.headers as Record<string, string>).authorization,
        'Bearer permanent-private'
      );
      body = JSON.parse(options!.body as string);
      assert.ok(options?.signal);
      return Response.json({
        api_key: 'temporary-only',
        expires_at: '2030-01-01T00:00:00.000Z',
        ignored: 'private'
      });
    },
    async () => 'permanent-private'
  );
  assert.deepEqual(body, {
    usage_type: 'transcribe_websocket',
    expires_in_seconds: 60,
    single_use: true,
    max_session_duration_seconds: 600
  });
  assert.deepEqual(issued, { value: 'temporary-only', expires_at: 1893456000 });
});

test('Soniox credential errors, malformed responses, cancellation and diagnostics never disclose payloads', async (t) => {
  for (const response of [
    new Response('private key/speech', { status: 401 }),
    Response.json({ api_key: 'private', expires_at: 'invalid' })
  ]) {
    await assert.rejects(
      issueSonioxCredential(
        new AbortController().signal,
        async () => response,
        async () => 'permanent'
      ),
      (error) => !String(error).includes('private')
    );
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    issueSonioxCredential(
      controller.signal,
      async () => {
        throw new Error('must not request');
      },
      async () => 'secret'
    )
  );
  const log = t.mock.method(console, 'warn', () => {});
  reportTranscriptionFailure(new Error('private key and speech'));
  assert.ok(!JSON.stringify(log.mock.calls).includes('private'));
});

test('Soniox development key is independent of OpenAI; production requires Secrets Manager and compute-role credentials', async (t) => {
  t.mock.property(process, 'env', {
    ...process.env,
    NODE_ENV: 'development',
    STT_SONIOX_API_KEY: 'local-soniox',
    STT_OPENAI_API_KEY: 'other-provider'
  });
  assert.equal(await sonioxKey(), 'local-soniox');
  Object.assign(process.env, { NODE_ENV: 'production' });
  delete process.env.STT_SONIOX_SECRET_ARN;
  await assert.rejects(sonioxKey(), /not configured/);
  const arn =
    'arn:aws:secretsmanager:us-west-2:123456789012:secret:soniox-test';
  process.env.STT_SONIOX_SECRET_ARN = arn;
  const send = t.mock.method(
    SecretsManagerClient.prototype,
    'send',
    async (command: GetSecretValueCommand) => {
      assert.ok(command instanceof GetSecretValueCommand);
      assert.equal(command.input.SecretId, arn);
      return { SecretString: 'role-resolved' };
    }
  );
  assert.equal(await sonioxKey(), 'role-resolved');
  assert.equal(await sonioxKey(), 'role-resolved');
  assert.equal(send.mock.callCount(), 1);
  process.env.STT_SONIOX_SECRET_ARN = 'invalid';
  await assert.rejects(sonioxKey(), /Invalid secret ARN/);
  process.env.STT_SONIOX_SECRET_ARN =
    'arn:aws:s3:us-west-2:123456789012:secret:wrong-service';
  await assert.rejects(sonioxKey(), /Invalid secret ARN/);
  process.env.STT_SONIOX_SECRET_ARN =
    'arn:aws:secretsmanager:us-west-2:123456789012:other-resource';
  await assert.rejects(sonioxKey(), /Invalid secret ARN/);
});
