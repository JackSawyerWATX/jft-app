import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { secretKey, SecretKeyError } from '../../src/shares/server/secret-key';

const arn =
  'arn:aws:secretsmanager:us-west-2:123456789012:secret:shared-cache-regression';

test('concurrent secret failures share a sanitized error; retry, caching and expiry stay consistent', async (t) => {
  let failing = true;
  let value = 'first synthetic key';
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const send = t.mock.method(
    SecretsManagerClient.prototype,
    'send',
    async () => {
      if (failing) throw new Error('sensitive upstream metadata');
      return { SecretString: value };
    }
  );
  const failures = await Promise.allSettled([secretKey(arn), secretKey(arn)]);
  assert.equal(send.mock.callCount(), 1);
  assert.ok(
    failures.every(
      (result) =>
        result.status === 'rejected' &&
        result.reason instanceof SecretKeyError &&
        result.reason.reason === 'secret_unavailable'
    )
  );
  assert.ok(
    failures.every(
      (result) =>
        result.status === 'rejected' &&
        !String(result.reason).includes('sensitive')
    )
  );
  if (failures[0].status === 'rejected' && failures[1].status === 'rejected') {
    assert.equal(failures[0].reason, failures[1].reason);
  }
  failing = false;
  assert.equal(await secretKey(arn), value);
  assert.equal(await secretKey(arn), value);
  assert.equal(send.mock.callCount(), 2);
  now += 5 * 60_000 + 1;
  value = 'rotated synthetic key';
  assert.equal(await secretKey(arn), value);
  assert.equal(send.mock.callCount(), 3);
  assert.equal(await secretKey(`${arn}-other`), value);
  assert.equal(send.mock.callCount(), 4);
});
