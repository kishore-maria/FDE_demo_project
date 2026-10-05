import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed/index.js';
import { loadTestEnv } from './testEnv.js';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));

// Runs once before all test files: rebuilds bookworm_test from scratch and seeds demo data.
export default async function setup() {
  loadTestEnv();
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
    execSync('npx prisma migrate deploy', { cwd: apiRoot, env: process.env, stdio: 'pipe' });
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
