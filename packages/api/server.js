import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) });

// Imported after dotenv so modules that read process.env at load time see the values.
const { createApp } = await import('./src/app.js');
const { startSweeper } = await import('./src/jobs/reservationSweeper.js');
const { prisma } = await import('./src/lib/prisma.js');

const port = Number(process.env.PORT ?? 3001);
const app = createApp();
const stopSweeper = startSweeper();

const server = app.listen(port, () => {
  console.log(`BookWorm API listening on http://localhost:${port}/api (docs: /api/docs)`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  stopSweeper();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
