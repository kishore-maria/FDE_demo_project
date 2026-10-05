import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));

/** Loads .env.test into process.env and refuses to run against a non-test database. */
export function loadTestEnv() {
  const parsed = dotenv.parse(readFileSync(envPath));
  Object.assign(process.env, parsed);

  if (!new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run tests against non-test database: ${process.env.DATABASE_URL}`);
  }
  return parsed;
}
