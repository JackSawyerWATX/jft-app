import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// This runs during the Amplify build. Build variables aren't automatically
// available to the SSR runtime, so write the persistence settings to the
// .env.production file that Next.js loads. Copy only the keys listed here.
const file = '.env.production';
const keys = ['SHARE_PERSISTENCE', 'DYNAMODB_TABLE_NAME', 'DYNAMODB_REGION'];
const mode = process.env.SHARE_PERSISTENCE ?? 'memory';

if (!['memory', 'dynamodb'].includes(mode)) {
  throw new Error('SHARE_PERSISTENCE must be memory or dynamodb.');
}

const entries = [`SHARE_PERSISTENCE=${mode}`];

// Only DynamoDB mode needs a table and region. Prefer the app's explicit
// DynamoDB region, and fall back to AWS_REGION when it's unset.
if (mode === 'dynamodb') {
  const table = process.env.DYNAMODB_TABLE_NAME;
  const region = process.env.DYNAMODB_REGION ?? process.env.AWS_REGION;
  const regionChars = 'abcdefghijklmnopqrstuvwxyz0123456789-';
  const tableChars = `${regionChars}ABCDEFGHIJKLMNOPQRSTUVWXYZ_.`;

  // Values are written as unquoted KEY=value lines. The allowed characters
  // exclude line breaks, which could introduce an unintended setting.
  if (!table || table.length < 3 || table.length > 255 ||
      [...table].some((character) => !tableChars.includes(character))) {
    throw new Error('Set DYNAMODB_TABLE_NAME to the deployed table name.');
  }

  if (!region || [...region].some((character) => !regionChars.includes(character))) {
    throw new Error('Set DYNAMODB_REGION to the deployed AWS region.');
  }

  entries.push(`DYNAMODB_TABLE_NAME=${table}`, `DYNAMODB_REGION=${region}`);
}

// Remove old assignments for all three managed keys before writing the new
// ones. This avoids duplicates on repeat builds and clears stale table and
// region values when switching back to memory mode.
const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
const retained = existing.replaceAll('\r\n', '\n').split('\n').filter((line) => {
  const equals = line.indexOf('=');
  if (equals === -1) return true;

  // Match both KEY=value and export KEY=value. Only inspect the key;
  // unrelated settings are carried forward without parsing their values.
  const key = line.slice(0, equals).trim();
  const name = key.startsWith('export ') || key.startsWith('export\t')
    ? key.slice(7).trimStart()
    : key;

  return !keys.includes(name);
});

const content = [retained.join('\n').trimEnd(), ...entries]
  .filter(Boolean)
  .join('\n');

// When creating the file on a system that honors POSIX permissions, request
// owner-only read/write access. Existing file permissions are unchanged.
writeFileSync(file, `${content}\n`, { mode: 0o600 });
console.log('Prepared non-secret SSR persistence settings.');
