import { writeFileSync } from 'node:fs';

// Amplify exposes build variables to the build, not the Next.js SSR runtime.
// Generate the small runtime config file; repository.ts validates it on use.
const mode = process.env.SHARE_PERSISTENCE ?? 'memory';
const entries = [`SHARE_PERSISTENCE=${JSON.stringify(mode)}`];

if (mode === 'dynamodb') {
  const table = process.env.DYNAMODB_TABLE_NAME;
  const region = process.env.DYNAMODB_REGION ?? process.env.AWS_REGION;
  if (table !== undefined)
    entries.push(`DYNAMODB_TABLE_NAME=${JSON.stringify(table)}`);
  if (region !== undefined)
    entries.push(`DYNAMODB_REGION=${JSON.stringify(region)}`);
}

writeFileSync('.env.production', `${entries.join('\n')}\n`, { mode: 0o600 });
console.log('Prepared SSR persistence settings.');
