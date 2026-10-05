import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { seedCatalog } from './catalog.js';
import { seedUsersAndOrders } from './users.js';

/** Seeds all demo data. Safe to run repeatedly. */
export async function seed(prisma) {
  const catalog = await seedCatalog(prisma);
  const accounts = await seedUsersAndOrders(prisma);
  return { catalog, accounts };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const prisma = new PrismaClient();
  try {
    const summary = await seed(prisma);
    console.log('Seed complete:', JSON.stringify(summary));
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
