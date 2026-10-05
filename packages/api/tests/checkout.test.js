import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { computeOrderTotals } from 'bookworm-shared';
import { afterAll, describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { expireReservations } from '../src/jobs/reservationSweeper.js';
import { prisma } from '../src/lib/prisma.js';
import { releaseReservation } from '../src/modules/orders/reservations.js';
import { authHeader, createUser, tokenFor, withStock } from './factories.js';

const app = createApp();
const bookId = (slug) => stableId('book', slug);
const JOY = 'joy-of-minimalism'; // ₹149 paperback
const PATH = 'the-path-to-success'; // ₹359 paperback
const VANISHING = 'the-vanishing-house'; // ₹99 eBook

const address = {
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.com',
  phone: '9876543210',
  line1: '12 Lake Road',
  city: 'Chennai',
  pin: '600001',
  state: 'Tamil Nadu',
};

const testUserIds = [];

async function shopper({ role = 'CUSTOMER', cart = [[JOY, 1], [PATH, 1]], ...overrides } = {}) {
  const { user } = await createUser({ role, ...overrides });
  testUserIds.push(user.id);
  for (const [slug, quantity] of cart) {
    await prisma.cartItem.create({ data: { userId: user.id, bookId: bookId(slug), quantity } });
  }
  const gsid = role === 'GUEST' ? randomUUID() : undefined;
  return { user, gsid, headers: authHeader(tokenFor(user, gsid ? { gsid } : undefined)) };
}

const checkout = (headers, body) => request(app).post('/api/orders/checkout').set(headers).send(body);
const stockOf = async (slug) => (await prisma.book.findUnique({ where: { id: bookId(slug) } })).stockQuantity;

// Leave no reserved stock behind for other test files.
afterAll(async () => {
  const pending = await prisma.order.findMany({ where: { userId: { in: testUserIds }, status: 'PENDING' } });
  for (const { id } of pending) await prisma.$transaction((tx) => releaseReservation(tx, id, 'CANCELLED'));
});

describe('POST /api/orders/checkout', () => {
  test('creates a PENDING order for the design cart with BOOK10 (total 46896 paise)', async () => {
    const { user, headers } = await shopper();
    const before = Date.now();
    const res = await checkout(headers, { address, couponCode: 'BOOK10', paymentMethod: 'CREDIT_CARD' });

    expect(res.status).toBe(201);
    const { order } = res.body;
    expect(order).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentMethod: 'CREDIT_CARD',
      couponCode: 'BOOK10',
      contactEmail: user.email,
      shippingAddress: { ...address, line2: null, country: 'India' },
      payments: [],
      shipments: [],
      flags: { canCancel: true, canReturn: false, canModifyAddress: false },
    });
    expect(order.orderNumber).toMatch(/^BW-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(order.totals).toMatchObject({
      itemCount: 2,
      subtotalPaise: 50800,
      subtotalInr: '₹508',
      taxPaise: 6096,
      deliveryChargePaise: 0,
      couponDiscountPaise: 10000,
      couponDiscountInr: '₹100',
      giftDiscountPaise: 0,
      totalPaise: 46896,
      totalInr: '₹468.96',
    });
    expect(order.items.map((i) => [i.title, i.quantity, i.priceAtPurchasePaise])).toEqual([
      ['Joy of Minimalism', 1, 14900],
      ['The Path to Success', 1, 35900],
    ]);

    const reservedFor = Date.parse(order.reservedUntil) - before;
    expect(reservedFor).toBeGreaterThan(29 * 60_000);
    expect(reservedFor).toBeLessThanOrEqual(31 * 60_000);
  });

  test('totals come from the shared computeOrderTotals', async () => {
    const { headers } = await shopper({ cart: [[JOY, 2], [PATH, 1]] });
    const coupon = await prisma.coupon.findUnique({ where: { code: 'SAVE20' } });
    const res = await checkout(headers, { address, couponCode: 'save20', paymentMethod: 'UPI' });

    const expected = computeOrderTotals({
      items: [
        { pricePaise: 14900, quantity: 2, format: 'PAPERBACK' },
        { pricePaise: 35900, quantity: 1, format: 'PAPERBACK' },
      ],
      coupon,
    });
    expect(res.body.order.totals).toMatchObject({
      subtotalPaise: expected.subtotalPaise,
      taxPaise: expected.taxPaise,
      couponDiscountPaise: expected.couponDiscountPaise,
      totalPaise: expected.totalPaise,
      giftPointsEarned: expected.pointsEarned,
    });
  });

  test('reserves stock but leaves cart, coupon usage and gift points untouched', async () => {
    const { user, headers } = await shopper({ giftPoints: 200, cart: [[JOY, 2], [PATH, 1]] });
    const [joyBefore, pathBefore] = [await stockOf(JOY), await stockOf(PATH)];
    const { usedCount } = await prisma.coupon.findUnique({ where: { code: 'BOOK10' } });

    const res = await checkout(headers, { address, couponCode: 'BOOK10', giftPointsToRedeem: 100, paymentMethod: 'WALLET' });
    expect(res.status).toBe(201);
    expect(res.body.order.totals).toMatchObject({ giftPointsRedeemed: 100, giftDiscountPaise: 10000 });

    expect(await stockOf(JOY)).toBe(joyBefore - 2);
    expect(await stockOf(PATH)).toBe(pathBefore - 1);
    expect(await prisma.cartItem.count({ where: { userId: user.id } })).toBe(2);
    expect((await prisma.coupon.findUnique({ where: { code: 'BOOK10' } })).usedCount).toBe(usedCount);
    expect((await prisma.user.findUnique({ where: { id: user.id } })).giftPoints).toBe(200);
  });

  test('a second checkout releases the first PENDING order and its stock', async () => {
    const { user, headers } = await shopper({ cart: [[JOY, 3]] });
    const stockBefore = await stockOf(JOY);

    const first = await checkout(headers, { address, paymentMethod: 'UPI' });
    expect(await stockOf(JOY)).toBe(stockBefore - 3);

    const second = await checkout(headers, { address, paymentMethod: 'UPI' });
    expect(second.status).toBe(201);
    expect(await stockOf(JOY)).toBe(stockBefore - 3);

    const previous = await prisma.order.findUnique({ where: { id: first.body.order.id } });
    expect(previous.status).toBe('CANCELLED');
    expect(previous.cancelledAt).not.toBeNull();
    expect(await prisma.order.count({ where: { userId: user.id, status: 'PENDING' } })).toBe(1);
  });

  test('insufficient stock is 409 and nothing changes (previous order stays reserved)', async () => {
    const { user, headers } = await shopper({ cart: [[JOY, 1], [PATH, 2]] });
    const first = await checkout(headers, { address, paymentMethod: 'UPI' });
    const joyBefore = await stockOf(JOY);
    await prisma.cartItem.updateMany({ where: { userId: user.id, bookId: bookId(PATH) }, data: { quantity: 5 } });

    await withStock(PATH, 1, async () => {
      const res = await checkout(headers, { address, paymentMethod: 'UPI' });
      expect(res.status).toBe(409);
      // Releasing this user's own 2 reserved copies would have made 3 available — still short of 5.
      expect(res.body.error).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        details: { bookId: bookId(PATH), available: 3, requested: 5 },
      });
      expect(await stockOf(PATH)).toBe(1);
    });

    expect(await stockOf(JOY)).toBe(joyBefore);
    expect((await prisma.order.findUnique({ where: { id: first.body.order.id } })).status).toBe('PENDING');
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
  });

  test('delivery is ₹49 under ₹500 and free for eBook-only orders', async () => {
    const paper = await shopper({ cart: [[JOY, 1]] });
    expect((await checkout(paper.headers, { address, paymentMethod: 'UPI' })).body.order.totals.deliveryChargePaise).toBe(4900);

    const ebook = await shopper({ cart: [[VANISHING, 1]] });
    expect((await checkout(ebook.headers, { address, paymentMethod: 'UPI' })).body.order.totals.deliveryChargePaise).toBe(0);
  });
});

describe('checkout address handling', () => {
  test('uses a saved address by id', async () => {
    const { user, headers } = await shopper();
    const saved = await prisma.address.create({ data: { userId: user.id, ...address, country: 'India', isDefault: true } });
    const res = await checkout(headers, { addressId: saved.id, paymentMethod: 'UPI' });
    expect(res.status).toBe(201);
    expect(res.body.order.shippingAddress).toMatchObject({ line1: '12 Lake Road', pin: '600001' });
  });

  test("another user's address is 404", async () => {
    const owner = await shopper();
    const saved = await prisma.address.create({ data: { userId: owner.user.id, ...address, country: 'India' } });
    const { headers } = await shopper();
    expect((await checkout(headers, { addressId: saved.id, paymentMethod: 'UPI' })).status).toBe(404);
  });

  test('saveAddress stores it for registered users (first one becomes default)', async () => {
    const { user, headers } = await shopper();
    await checkout(headers, { address, saveAddress: true, paymentMethod: 'UPI' });
    const saved = await prisma.address.findMany({ where: { userId: user.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ line1: '12 Lake Road', isDefault: true });
  });

  test('both or neither address fields is 400', async () => {
    const { headers } = await shopper();
    expect((await checkout(headers, { paymentMethod: 'UPI' })).status).toBe(400);
    expect((await checkout(headers, { address, addressId: randomUUID(), paymentMethod: 'UPI' })).status).toBe(400);
  });

  test.each([
    ['missing paymentMethod', { address }],
    ['bad pin', { address: { ...address, pin: '123' }, paymentMethod: 'UPI' }],
    ['bad phone', { address: { ...address, phone: '+919876543210' }, paymentMethod: 'UPI' }],
    ['unknown payment method', { address, paymentMethod: 'CASH' }],
    ['negative points', { address, paymentMethod: 'UPI', giftPointsToRedeem: -1 }],
  ])('%s is 400', async (_label, body) => {
    const { headers } = await shopper();
    expect((await checkout(headers, body)).status).toBe(400);
  });
});

describe('checkout validation', () => {
  test('empty cart is 422 CART_EMPTY', async () => {
    const { headers } = await shopper({ cart: [] });
    const res = await checkout(headers, { address, paymentMethod: 'UPI' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_EMPTY');
  });

  test('invalid coupons are 422 with the coupon reason', async () => {
    const { headers } = await shopper({ cart: [[JOY, 1]] });
    const expired = await checkout(headers, { address, couponCode: 'EXPIRED10', paymentMethod: 'UPI' });
    expect(expired.status).toBe(422);
    expect(expired.body.error.code).toBe('COUPON_EXPIRED');

    const tooSmall = await checkout(headers, { address, couponCode: 'BOOK10', paymentMethod: 'UPI' });
    expect(tooSmall.body.error.code).toBe('COUPON_MIN_ORDER_NOT_MET');
  });

  test('redeeming more points than the balance is 422', async () => {
    const { headers } = await shopper({ giftPoints: 50 });
    const res = await checkout(headers, { address, giftPointsToRedeem: 51, paymentMethod: 'UPI' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_POINTS', details: { available: 50, requested: 51 } });
  });

  test('requires a token', async () => {
    expect((await request(app).post('/api/orders/checkout').send({ address, paymentMethod: 'UPI' })).status).toBe(401);
  });
});

describe('guest checkout', () => {
  test('sets guestSessionId and contactEmail from the guest session', async () => {
    const { user, gsid, headers } = await shopper({ role: 'GUEST' });
    const res = await checkout(headers, { address, paymentMethod: 'UPI' });
    expect(res.status).toBe(201);
    expect(res.body.order.contactEmail).toBe(user.email);

    const stored = await prisma.order.findUnique({ where: { id: res.body.order.id } });
    expect(stored.guestSessionId).toBe(gsid);
  });

  test('guests cannot redeem gift points', async () => {
    const { headers } = await shopper({ role: 'GUEST' });
    const res = await checkout(headers, { address, giftPointsToRedeem: 10, paymentMethod: 'UPI' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('POINTS_NOT_ALLOWED');
  });

  test('saveAddress is ignored for guests', async () => {
    const { user, headers } = await shopper({ role: 'GUEST' });
    expect((await checkout(headers, { address, saveAddress: true, paymentMethod: 'UPI' })).status).toBe(201);
    expect(await prisma.address.count({ where: { userId: user.id } })).toBe(0);
  });

  test('registered orders have no guestSessionId', async () => {
    const { headers } = await shopper();
    const res = await checkout(headers, { address, paymentMethod: 'UPI' });
    expect((await prisma.order.findUnique({ where: { id: res.body.order.id } })).guestSessionId).toBeNull();
  });
});

describe('expireReservations', () => {
  test('expires overdue PENDING orders and restores their stock exactly once', async () => {
    const { headers } = await shopper({ cart: [[PATH, 2]] });
    const stockBefore = await stockOf(PATH);
    const { body } = await checkout(headers, { address, paymentMethod: 'UPI' });
    expect(await stockOf(PATH)).toBe(stockBefore - 2);

    await prisma.order.update({ where: { id: body.order.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
    expect(await expireReservations()).toBeGreaterThanOrEqual(1);

    expect((await prisma.order.findUnique({ where: { id: body.order.id } })).status).toBe('EXPIRED');
    expect(await stockOf(PATH)).toBe(stockBefore);

    await expireReservations();
    expect(await stockOf(PATH)).toBe(stockBefore);
  });

  test('leaves orders that are still within their reservation', async () => {
    const { headers } = await shopper({ cart: [[JOY, 1]] });
    const { body } = await checkout(headers, { address, paymentMethod: 'UPI' });
    await expireReservations();
    expect((await prisma.order.findUnique({ where: { id: body.order.id } })).status).toBe('PENDING');
  });

  test('an order that is no longer PENDING is not released again', async () => {
    const { headers } = await shopper({ cart: [[JOY, 1]] });
    const { body } = await checkout(headers, { address, paymentMethod: 'UPI' });
    const stock = await stockOf(JOY);
    await prisma.order.update({
      where: { id: body.order.id },
      data: { status: 'CONFIRMED', reservedUntil: new Date(Date.now() - 1000) },
    });
    await expireReservations();
    expect(await stockOf(JOY)).toBe(stock);
    await prisma.order.update({ where: { id: body.order.id }, data: { status: 'PENDING' } });
  });
});
