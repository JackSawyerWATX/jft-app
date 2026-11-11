import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { parseRuntimeConfig } from '../../src/config/runtime';
import { parseTranscriptionProvider } from '../../src/shares/transcription/config';
import { parseSecretArn } from '../../src/config/secret-arn';

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('next/package.json'));
const nextEnvironment = nextRequire.resolve('@next/env');

test('deployment and runtime use identical provider and secret ARN rules', () => {
  for (const provider of [
    undefined,
    'soniox',
    'openai',
    '',
    'typo',
    ' openai',
    'openai\nINJECTED=true'
  ]) {
    let expected: string;
    try {
      expected = parseTranscriptionProvider(provider);
    } catch {
      assert.throws(() => parseRuntimeConfig({ STT_PROVIDER: provider }));
      continue;
    }
    assert.equal(
      parseRuntimeConfig({ STT_PROVIDER: provider }).STT_PROVIDER,
      expected
    );
  }
  for (const value of [
    'invalid',
    'arn:aws:s3:::bucket',
    'arn:aws:secretsmanager::123456789012:secret:missing-region',
    'arn:aws:secretsmanager:us-west-2:123456789012:secret:'
  ]) {
    assert.throws(() => parseSecretArn(value));
    assert.throws(() => parseRuntimeConfig({ STT_OPENAI_SECRET_ARN: value }));
  }
});

test('generated configuration round-trips through Next environment loading and mode changes', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'runtime-roundtrip-'));
  const file = path.join(directory, '.env.production');
  const initial =
    '# Keep existing delivery\nSESSION_SECRET=fictional-stable-signing-secret-at-least-32-bytes\nQUOTED="a value with spaces # literal"\nMULTILINE="first\nSTT_PROVIDER=inside\nlast"\n';
  writeFileSync(file, initial);
  const settings = {
    SHARE_PERSISTENCE: 'dynamodb',
    DYNAMODB_TABLE_NAME: 'fictional-shares',
    DYNAMODB_REGION: 'us-west-2',
    STT_PROVIDER: 'soniox',
    STT_ENABLED: 'true'
  };
  const prepare = (overrides: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      [
        '--import',
        path.resolve('node_modules/tsx/dist/loader.mjs'),
        path.resolve('scripts/prepare-runtime-env.ts')
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, ...settings, ...overrides }
      }
    );
  const load = () => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve('tests/quality/fixtures/load-next-env.mjs'),
        nextEnvironment
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'production' }
      }
    );
    assert.equal(result.status, 0);
    assert.ok(
      result.stdout,
      `Next loader returned no output: ${result.stderr}`
    );
    return JSON.parse(result.stdout);
  };
  try {
    assert.equal(prepare().status, 0);
    const generated = readFileSync(file, 'utf8');
    assert.equal(prepare().status, 0);
    assert.equal(readFileSync(file, 'utf8'), generated);
    assert.deepEqual(load(), {
      ...settings,
      SESSION_SECRET: 'fictional-stable-signing-secret-at-least-32-bytes',
      QUOTED: 'a value with spaces # literal',
      MULTILINE: 'first\nSTT_PROVIDER=inside\nlast'
    });
    assert.equal(prepare({ DYNAMODB_TABLE_NAME: '' }).status, 1);
    assert.equal(readFileSync(file, 'utf8'), generated);
    assert.equal(
      prepare({
        SHARE_PERSISTENCE: 'memory',
        STT_PROVIDER: 'openai',
        STT_ENABLED: 'false'
      }).status,
      0
    );
    assert.equal(load().DYNAMODB_TABLE_NAME, '');
    assert.equal(load().DYNAMODB_REGION, '');
    assert.equal(load().STT_PROVIDER, 'openai');
    assert.equal(
      load().SESSION_SECRET,
      'fictional-stable-signing-secret-at-least-32-bytes'
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
