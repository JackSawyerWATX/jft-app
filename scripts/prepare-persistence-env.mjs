import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Amplify build variables don't automatically reach the SSR runtime.
// Copy only these non-secret persistence settings into Next.js's environment file.
const file = '.env.production';
const keys = ['SHARE_PERSISTENCE', 'DYNAMODB_TABLE_NAME', 'DYNAMODB_REGION'];
const mode = process.env.SHARE_PERSISTENCE ?? 'memory';

if (!['memory', 'dynamodb'].includes(mode)) {
  throw new Error('SHARE_PERSISTENCE must be memory or dynamodb.');
}

const entries = [`SHARE_PERSISTENCE=${mode}`];

if (mode === 'dynamodb') {
  const table = process.env.DYNAMODB_TABLE_NAME;
  const region = process.env.DYNAMODB_REGION ?? process.env.AWS_REGION;
  const regionChars = 'abcdefghijklmnopqrstuvwxyz0123456789-';
  const tableChars = `${regionChars}ABCDEFGHIJKLMNOPQRSTUVWXYZ_.`;

// Check values before writing them as dotenv entries so they can't inject
// additional settings through line breaks.
  if (!table || table.length < 3 || table.length > 255 ||
      [...table].some((character) => !tableChars.includes(character))) {
    throw new Error('Set DYNAMODB_TABLE_NAME to the deployed table name.');
  }

  if (!region || [...region].some((character) => !regionChars.includes(character))) {
    throw new Error('Set DYNAMODB_REGION to the deployed AWS region.');
  }

  entries.push(`DYNAMODB_TABLE_NAME=${table}`, `DYNAMODB_REGION=${region}`);
}

// Preserve unrelated settings and replace previous persistence entries so
// rerunning the script doesn't leave stale or duplicate values.
// Replace only the non-secret persistence settings; keep other settings intact.
const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
const retained = existing.replaceAll('\r\n', '\n').split('\n').filter((line) => {
  const equals = line.indexOf('=');
  if (equals === -1) return true;

  const key = line.slice(0, equals).trim();
  const name = key.startsWith('export ') || key.startsWith('export\t')
    ? key.slice(7).trimStart()
    : key;

  return !keys.includes(name);
});

const content = [retained.join('\n').trimEnd(), ...entries]
  .filter(Boolean)
  .join('\n');

writeFileSync(file, `${content}\n`, { mode: 0o600 });
console.log('Prepared non-secret SSR persistence settings.');
