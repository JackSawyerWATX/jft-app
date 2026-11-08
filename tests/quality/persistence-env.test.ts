import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('Amplify persistence preparation writes only non-secret runtime settings', () => {
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
    assert.equal(run().status, 0);
    const generated = readFileSync(file, 'utf8');
    assert.match(generated, /SHARE_PERSISTENCE="dynamodb"/);
    assert.match(generated, /DYNAMODB_TABLE_NAME="fictional-dev-shares"/);
    assert.equal(generated.includes('fictional-must-not-be-written'), false);
    assert.equal(run({ DYNAMODB_TABLE_NAME: 'bad\nINJECTED=true' }).status, 0);
    assert.equal(readFileSync(file, 'utf8').includes('\nINJECTED=true'), false);
    assert.equal(run({ SHARE_PERSISTENCE: 'memory' }).status, 0);
    const local = readFileSync(file, 'utf8');
    assert.match(local, /SHARE_PERSISTENCE="memory"/);
    assert.equal(local.includes('DYNAMODB_TABLE_NAME='), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
