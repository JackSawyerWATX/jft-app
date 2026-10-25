import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const password = () => randomBytes(24).toString('hex');
try {
  writeFileSync(
    new URL('../.env.database', import.meta.url),
    `USER_CONTENT_DB_PASSWORD=${password()}\nDAILY_REFLECTIONS_DB_PASSWORD=${password()}\n`,
    { flag: 'wx', mode: 0o600 }
  );
  console.log(
    'Created .env.database with two random local database passwords.'
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Keeping existing .env.database credentials.');
}
