import { prisma } from '../lib/prisma.js';
import { releaseReservation } from '../modules/orders/reservations.js';

/**
 * Expires PENDING orders whose 30-minute reservation has run out and restores their stock.
 * @returns {Promise<number>} how many orders were expired
 */
export async function expireReservations(now = new Date()) {
  const due = await prisma.order.findMany({
    where: { status: 'PENDING', reservedUntil: { lt: now } },
    select: { id: true },
  });

  let expired = 0;
  for (const { id } of due) {
    // One transaction per order so a single failure doesn't block the rest.
    const released = await prisma.$transaction((tx) => releaseReservation(tx, id, 'EXPIRED', now));
    if (released) expired += 1;
  }
  return expired;
}

/**
 * Runs expireReservations every SWEEPER_INTERVAL_MS (default 60s). Not started in tests.
 * @returns {() => void} stop function
 */
export function startSweeper(intervalMs = Number(process.env.SWEEPER_INTERVAL_MS ?? 60_000)) {
  const timer = setInterval(() => {
    expireReservations().catch((error) => console.error('[sweeper] failed to expire reservations', error));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
