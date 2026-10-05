import bcrypt from 'bcryptjs';
import { afterAll, describe, expect, test } from 'vitest';
import { computeOrderTotals } from 'bookworm-shared';
import { prisma } from '../src/lib/prisma.js';
import { seed } from '../prisma/seed/index.js';
import { createUser } from './factories.js';

const getUser = (email) => prisma.user.findUnique({ where: { email } });

async function seededCounts() {
  const tables = [
    'user',
    'address',
    'coupon',
    'order',
    'orderItem',
    'payment',
    'shipment',
    'shipmentEvent',
    'giftPointTransaction',
    'authorFollow',
    'review',
    'book',
    'category',
  ];
  const counts = await Promise.all(tables.map((t) => prisma[t].count()));
  return Object.fromEntries(tables.map((t, i) => [t, counts[i]]));
}

describe('users, orders and coupons seed', () => {
  afterAll(() => prisma.$disconnect());

  test.each([
    ['admin@bookworm.com', 'Admin@1234', 'ADMIN'],
    ['customer@test.com', 'Test@1234', 'CUSTOMER'],
    ['fresh@test.com', 'Test@1234', 'CUSTOMER'],
  ])('%s exists with role %s and a working password', async (email, password, role) => {
    const user = await getUser(email);
    expect(user.role).toBe(role);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
  });

  test('customer has 200 gift points, ₹1000 wallet and a default address', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'customer@test.com' },
      include: { addresses: true },
    });
    expect(user.giftPoints).toBe(200);
    expect(user.walletBalancePaise).toBe(100000);
    expect(user.addresses).toHaveLength(1);
    expect(user.addresses[0]).toMatchObject({ isDefault: true, city: 'Bengaluru', pin: '560001' });
  });

  test('gift point history adds up to the balance', async () => {
    const user = await getUser('customer@test.com');
    const txns = await prisma.giftPointTransaction.findMany({ where: { userId: user.id } });
    const balance = txns.reduce((sum, t) => sum + (t.type === 'CREDIT' ? t.points : -t.points), 0);
    expect(balance).toBe(user.giftPoints);
  });

  test('customer has 2 delivered orders with totals from the shared pricing function', async () => {
    const user = await getUser('customer@test.com');
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      include: { items: { include: { book: true } }, coupon: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(orders.map((o) => o.orderNumber)).toEqual(['BW-SEED000A', 'BW-SEED000B']);

    for (const order of orders) {
      expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' });
      expect(order.items).toHaveLength(2);
      const totals = computeOrderTotals({
        items: order.items.map((i) => ({
          pricePaise: i.priceAtPurchasePaise,
          quantity: i.quantity,
          format: i.book.format,
        })),
        coupon: order.coupon,
      });
      expect(order.totalPaise).toBe(totals.totalPaise);
      expect(order.giftPointsEarned).toBe(totals.pointsEarned);
    }

    expect(orders[0].items.map((i) => i.book.slug).sort()).toEqual(['less-but-better', 'the-focus-reset']);
    expect(orders[1].coupon.code).toBe('WELCOME50');
  });

  test('order A is outside the 48h cancel window, order B is still returnable', async () => {
    const day = 24 * 60 * 60 * 1000;
    const [a, b] = await Promise.all(
      ['BW-SEED000A', 'BW-SEED000B'].map((orderNumber) =>
        prisma.order.findUnique({ where: { orderNumber }, include: { shipments: true } }),
      ),
    );
    expect(Date.now() - a.createdAt.getTime()).toBeGreaterThan(29 * day);
    expect(Date.now() - b.shipments[0].actualDelivery.getTime()).toBeLessThan(7 * day);
  });

  test('every seeded order has a successful payment and a delivered shipment with 4 events', async () => {
    const orders = await prisma.order.findMany({
      where: { orderNumber: { startsWith: 'BW-SEED' } },
      include: { payments: true, shipments: { include: { events: true } } },
    });
    for (const order of orders) {
      expect(order.payments).toHaveLength(1);
      expect(order.payments[0]).toMatchObject({ status: 'SUCCEEDED', amountPaise: order.totalPaise });
      expect(order.shipments).toHaveLength(1);
      expect(order.shipments[0].status).toBe('DELIVERED');
      expect(order.shipments[0].trackingNumber).toMatch(/^TRK-/);
      expect(order.shipments[0].events.map((e) => e.status).sort()).toEqual(
        ['DELIVERED', 'OUT_FOR_DELIVERY', 'PROCESSING', 'SHIPPED'],
      );
    }
  });

  test('card payments keep only the last 4 digits', async () => {
    const payments = await prisma.payment.findMany({
      where: { method: { in: ['CREDIT_CARD', 'DEBIT_CARD'] }, status: 'SUCCEEDED' },
    });
    for (const payment of payments) expect(payment.cardLast4).toMatch(/^\d{4}$/);
  });

  test('4 coupons exist and EXPIRED10 is expired', async () => {
    const coupons = await prisma.coupon.findMany({ orderBy: { code: 'asc' } });
    expect(coupons.map((c) => c.code)).toEqual(['BOOK10', 'EXPIRED10', 'SAVE20', 'WELCOME50']);
    const expired = coupons.find((c) => c.code === 'EXPIRED10');
    expect(expired.validUntil.getTime()).toBeLessThan(Date.now());
    expect(coupons.find((c) => c.code === 'SAVE20')).toMatchObject({
      discountType: 'PERCENT',
      discountValue: 20,
      maxDiscountPaise: 20000,
    });
  });

  test('customer follows Daniel Reed and Sophia Bennett', async () => {
    const user = await getUser('customer@test.com');
    const follows = await prisma.authorFollow.findMany({
      where: { userId: user.id },
      include: { author: true },
    });
    expect(follows.map((f) => f.author.name).sort()).toEqual(['Daniel Reed', 'Sophia Bennett']);
  });

  test('fresh@test.com has no history', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'fresh@test.com' },
      include: { orders: true, follows: true, addresses: true },
    });
    expect(user.orders).toHaveLength(0);
    expect(user.follows).toHaveLength(0);
    expect(user.addresses).toHaveLength(0);
  });

  test('createUser factory makes unique users', async () => {
    const [a, b] = await Promise.all([createUser(), createUser({ role: 'GUEST' })]);
    expect(a.email).not.toBe(b.email);
    expect(b.user.passwordHash).toBeNull();
    await prisma.user.deleteMany({ where: { id: { in: [a.user.id, b.user.id] } } });
  });

  test('running the full seed again does not duplicate anything', async () => {
    const before = await seededCounts();
    await seed(prisma);
    expect(await seededCounts()).toEqual(before);
  });
});
