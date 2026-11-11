/**
 * Amplify exposes build variables separately from the Next.js SSR runtime.
 * Run `node scripts/prepare-transcription-env.mjs` from the repository root,
 * immediately before `npm run build` in the trusted branch's build commands.
 * This updates only non-secret speech settings in .env.production; existing
 * assignments are edited in place with dotenvx source primitives. Provider API keys
 * must stay in Secrets Manager and are never copied from the build environment.
 * Local development uses .env.local and does not need this script.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import dotenvSource from '@dotenvx/primitives';
import { parse as parseArn } from '@aws-sdk/util-arn-parser';

const file = '.env.production';
let content = existsSync(file) ? readFileSync(file, 'utf8') : '';
const { upsert } = dotenvSource;
const choices = {
  STT_ENABLED: ['true', 'false'],
  STT_PROVIDER: ['soniox', 'openai']
};
const keys = [
  ...Object.keys(choices),
  'STT_SONIOX_SECRET_ARN',
  'STT_OPENAI_SECRET_ARN'
];

for (const key of keys) {
  // Write every managed key so stale values cannot survive a later build.
  const value =
    process.env[key] ??
    (key === 'STT_PROVIDER' ? 'soniox' : key === 'STT_ENABLED' ? 'false' : '');
  try {
    if (choices[key]) {
      if (!choices[key].includes(value)) throw new Error('Invalid option');
    } else if (value) {
      const arn = parseArn(value);
      if (
        arn.service !== 'secretsmanager' ||
        !arn.resource.startsWith('secret:') ||
        !arn.region
      ) {
        throw new Error('Not a regional Secrets Manager secret');
      }
    }
  } catch {
    throw new Error(`Invalid ${key}`);
  }
  content = upsert(content, key, value);
}

writeFileSync(file, content, { mode: 0o600 });
console.log('Prepared non-secret SSR transcription settings.');
