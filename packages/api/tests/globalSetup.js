import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadTestEnv } from './testEnv.js';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

// Runs once before all test files: brings bookworm_test up to the latest migration.
export default function setup() {
  loadTestEnv();
  execSync('npx prisma migrate deploy', { cwd: apiRoot, env: process.env, stdio: 'pipe' });
}
