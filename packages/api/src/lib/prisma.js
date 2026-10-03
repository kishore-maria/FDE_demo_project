import { PrismaClient } from '@prisma/client';

// Single shared client; ESM module caching keeps one instance per process.
export const prisma = new PrismaClient();

export default prisma;
