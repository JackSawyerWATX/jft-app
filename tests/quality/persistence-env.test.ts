import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { test } from 'node:test';

test('Amplify persistence preparation writes only non-secret runtime settings', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'doorknob-env-test-'));
  const script = path.resolve('scripts/prepare-runtime-env.ts');
  const file = path.join(directory, '.env.production');
  const run = (settings: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      ['--import', path.resolve('node_modules/tsx/dist/loader.mjs'), script],
      {
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
      }
    );
  try {
    writeFileSync(
      file,
      'SESSION_SECRET=fictional-stable-secret-at-least-32-bytes\nOTHER_SETTING=keep\n'
    );
    assert.equal(run().status, 0);
    const generated = readFileSync(file, 'utf8');
    assert.equal(parseEnv(generated).SHARE_PERSISTENCE, 'dynamodb');
    assert.equal(parseEnv(generated).OTHER_SETTING, 'keep');
    assert.equal(
      parseEnv(generated).SESSION_SECRET,
      'fictional-stable-secret-at-least-32-bytes'
    );
    assert.equal(run({ DYNAMODB_TABLE_NAME: '' }).status, 1);
    assert.equal(readFileSync(file, 'utf8'), generated);
    assert.equal(
      parseEnv(generated).DYNAMODB_TABLE_NAME,
      'fictional-dev-shares'
    );
    assert.equal(generated.includes('fictional-must-not-be-written'), false);
    assert.equal(run({ SHARE_PERSISTENCE: 'invalid' }).status, 1);
    assert.equal(readFileSync(file, 'utf8').includes('\nINJECTED=true'), false);
    assert.equal(run({ SHARE_PERSISTENCE: 'memory' }).status, 0);
    const local = readFileSync(file, 'utf8');
    assert.equal(parseEnv(local).SHARE_PERSISTENCE, 'memory');
    assert.equal(parseEnv(local).DYNAMODB_TABLE_NAME, '');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
