import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('Amplify persistence preparation validates configuration and copies only non-secret settings idempotently', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'doorknob-env-test-'));
  const script = path.resolve('scripts/prepare-persistence-env.mjs');
  const file = path.join(directory, '.env.production');
  const run = (settings: Record<string, string> = {}) =>
    spawnSync(process.execPath, [script], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        SHARE_PERSISTENCE: 'dynamodb',
        DYNAMODB_TABLE_NAME: 'fictional-dev-shares',
        DYNAMODB_REGION: 'us-west-2',
        AWS_SECRET_ACCESS_KEY: 'fictional-must-not-be-written',
        STT_OPENAI_API_KEY: 'fictional-must-not-be-written',
        ...settings
      }
    });
  try {
    writeFileSync(file, 'EXISTING_SETTING=keep\nSHARE_PERSISTENCE=memory\n');
    assert.equal(run().status, 0);
    const generated = readFileSync(file, 'utf8');
    assert.match(generated, /EXISTING_SETTING=keep/);
    assert.match(generated, /SHARE_PERSISTENCE=dynamodb/);
    assert.match(generated, /DYNAMODB_TABLE_NAME=fictional-dev-shares/);
    assert.equal(generated.includes('fictional-must-not-be-written'), false);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(file, 'utf8'), generated);
    assert.equal(run({ DYNAMODB_TABLE_NAME: '' }).status, 1);
    assert.equal(readFileSync(file, 'utf8'), generated);
    assert.equal(run({ DYNAMODB_TABLE_NAME: 'bad\nINJECTED=true' }).status, 1);
    assert.equal(run({ SHARE_PERSISTENCE: 'unknown' }).status, 1);
    assert.equal(run({ SHARE_PERSISTENCE: 'memory' }).status, 0);
    const local = readFileSync(file, 'utf8');
    assert.match(local, /SHARE_PERSISTENCE=memory/);
    assert.equal(local.includes('DYNAMODB_TABLE_NAME='), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
