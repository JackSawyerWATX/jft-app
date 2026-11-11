// Isolated process: Next caches its initial environment. Emit only fictional fixture settings.
import { pathToFileURL } from 'node:url';
const { default: environment } = await import(
  pathToFileURL(process.argv[2]).href
);
const { loadEnvConfig } = environment;
const keys = [
  'SHARE_PERSISTENCE',
  'DYNAMODB_TABLE_NAME',
  'DYNAMODB_REGION',
  'STT_PROVIDER',
  'STT_ENABLED',
  'SESSION_SECRET',
  'QUOTED',
  'MULTILINE'
];
for (const key of keys) delete process.env[key];
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
process.stdout.write(
  JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key]])))
);
