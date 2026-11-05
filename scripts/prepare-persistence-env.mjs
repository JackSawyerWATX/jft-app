import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Amplify build variables do not automatically reach Hosting SSR. Copy only this
// non-secret allowlist; never dump the build environment or AWS credentials.
const mode = process.env.SHARE_PERSISTENCE ?? 'memory';
if (!['memory', 'dynamodb'].includes(mode)) {
  throw new Error('SHARE_PERSISTENCE must be memory or dynamodb.');
}
const entries = { SHARE_PERSISTENCE: mode };
if (mode === 'dynamodb') {
  const table = process.env.DYNAMODB_TABLE_NAME;
  const region = process.env.DYNAMODB_REGION ?? process.env.AWS_REGION;
  if (!table || !/^[A-Za-z0-9_.-]{3,255}$/.test(table)) {
    throw new Error('Set DYNAMODB_TABLE_NAME to the deployed table name.');
  }
  if (!region || !/^[a-z0-9-]+$/.test(region)) {
    throw new Error('Set DYNAMODB_REGION to the deployed AWS region.');
  }
  entries.DYNAMODB_TABLE_NAME = table;
  entries.DYNAMODB_REGION = region;
}
const existing = existsSync('.env.production')
  ? readFileSync('.env.production', 'utf8')
  : '';
const retained = existing
  .split(/\r?\n/)
  .filter(
    (line) =>
      !/^(?:export\s+)?(?:SHARE_PERSISTENCE|DYNAMODB_TABLE_NAME|DYNAMODB_REGION)\s*=/.test(
        line
      )
  );
writeFileSync(
  '.env.production',
  `${retained.join('\n').trimEnd()}\n${Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`,
  { mode: 0o600 }
);
console.log('Prepared non-secret SSR persistence settings.');
