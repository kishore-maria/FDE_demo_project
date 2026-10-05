import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { maskUpi } from '../src/modules/payments/payments.service.js';
import { checkoutCart, createShopper, payOrder } from './factories.js';

const app = createApp();
const bookId = (slug) => stableId('book', slug);
// Books not asserted on by other test files (stock and sales counts change here).
const BIO = 'a-life-in-colour'; // ₹379, Meera Iyer
const POETRY = 'rain-on-tin-roofs'; // ₹199, Raj Patel
const EBOOK = 'the-last-act'; // ₹269 eBook, Jessica Martin

const initiate = (headers, body) => request(app).post('/api/payments/initiate').set(headers).send(body);
const confirm = (headers, body) => request(app).post('/api/payments/confirm').set(headers).send(body);
const card = { number: '4111-1111-1111-1234', nameOnCard: 'Asha Rao', expiry: '12/2030', cvv: '987' };
const book = (slug) => prisma.book.findUnique({ where: { id: bookId(slug) } });

describe('POST /api/payments/initiate', () => {
  test('creates a session for the payable amount', async () => {
    const { headers } = await createShopper({ cart: [[BIO, 1]], walletBalancePaise: 5000 });
    const order = await checkoutCart(app, headers);
    const res = await initiate(headers, { orderId: order.id, method: 'CREDIT_CARD' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orderId: order.id,
      method: 'CREDIT_CARD',
      payableAmountPaise: order.totals.totalPaise,
      payableAmountInr: order.totals.totalInr,
      walletBalancePaise: 5000,
    });
    expect(res.body.sessionId).toBeTruthy();
  });

  test("someone else's order is 404; a guest from another session is 404", async () => {
    const owner = await createShopper({ role: 'GUEST', cart: [[BIO, 1]] });
    const order = await checkoutCart(app, owner.headers);

    const stranger = await createShopper();
    expect((await initiate(stranger.headers, { orderId: order.id, method: 'UPI' })).status).toBe(404);

    const otherSession = await createShopper({ role: 'GUEST' });
    expect((await initiate(otherSession.headers, { orderId: order.id, method: 'UPI' })).status).toBe(404);
    expect((await initiate(owner.headers, { orderId: order.id, method: 'UPI' })).status).toBe(200);
  });

  test('expired reservation is 409 and releases the stock', async () => {
    const { headers } = await createShopper({ cart: [[BIO, 2]] });
    const order = await checkoutCart(app, headers);
    const stock = (await book(BIO)).stockQuantity;
    await prisma.order.update({ where: { id: order.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });

    const res = await initiate(headers, { orderId: order.id, method: 'UPI' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVATION_EXPIRED');
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('EXPIRED');
    expect((await book(BIO)).stockQuantity).toBe(stock + 2);
  });

  test('requires a token; validates body', async () => {
    expect((await request(app).post('/api/payments/initiate').send({ orderId: randomUUID(), method: 'UPI' })).status).toBe(401);
    const { headers } = await createShopper();
    expect((await initiate(headers, { orderId: randomUUID(), method: 'CASH' })).status).toBe(400);
    expect((await initiate(headers, { orderId: randomUUID(), method: 'UPI' })).status).toBe(404);
  });
});

describe('POST /api/payments/confirm — success', () => {
  test('finalises everything in one go', async () => {
    const { user, headers } = await createShopper({ cart: [[BIO, 1], [POETRY, 2]], giftPoints: 100 });
    const order = await checkoutCart(app, headers, { couponCode: 'WELCOME50', giftPointsToRedeem: 40 });
    await prisma.cartItem.create({ data: { userId: user.id, bookId: bookId(EBOOK), quantity: 1 } });

    const coupon = await prisma.coupon.findUnique({ where: { code: 'WELCOME50' } });
    const [bioSales, poetrySales] = [(await book(BIO)).salesCount, (await book(POETRY)).salesCount];

    const res = await payOrder(app, headers, order.id, { method: 'CREDIT_CARD' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toMatchObject({ status: 'SUCCEEDED', method: 'CREDIT_CARD', cardLast4: '4242' });
    expect(res.body.order).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: 'CREDIT_CARD' });
    expect(res.body.order.confirmedAt).toBeTruthy();

    // Ordered books leave the cart; the book added after checkout stays.
    const cart = await prisma.cartItem.findMany({ where: { userId: user.id } });
    expect(cart.map((i) => i.bookId)).toEqual([bookId(EBOOK)]);

    expect((await prisma.coupon.findUnique({ where: { code: 'WELCOME50' } })).usedCount).toBe(coupon.usedCount + 1);
    expect((await book(BIO)).salesCount).toBe(bioSales + 1);
    expect((await book(POETRY)).salesCount).toBe(poetrySales + 2);

    const points = await prisma.giftPointTransaction.findMany({ where: { orderId: order.id }, orderBy: { type: 'asc' } });
    expect(points.map((p) => [p.type, p.points])).toEqual([
      ['CREDIT', order.totals.giftPointsEarned],
      ['DEBIT', 40],
    ]);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.giftPoints).toBe(100 - 40 + order.totals.giftPointsEarned);

    expect(res.body.order.shipments).toHaveLength(1);
    expect(res.body.order.shipments[0]).toMatchObject({ type: 'FORWARD', status: 'PROCESSING', carrier: 'BookWorm Express' });
    expect(res.body.order.shipments[0].trackingNumber).toMatch(/^TRK-[0-9A-Z]{10}$/);
    expect(res.body.order.shipments[0].events.map((e) => e.status)).toEqual(['PROCESSING']);

    const follows = await prisma.authorFollow.findMany({ where: { userId: user.id }, include: { author: true } });
    expect(follows.map((f) => [f.author.name, f.source]).sort()).toEqual([
      ['Meera Iyer', 'AUTO_PURCHASE'],
      ['Raj Patel', 'AUTO_PURCHASE'],
    ]);
  });

  test('UPI keeps only a masked handle; DB never holds a full card number or CVV', async () => {
    const upiShopper = await createShopper({ cart: [[POETRY, 1]] });
    const upiOrder = await checkoutCart(app, upiShopper.headers);
    const upiRes = await payOrder(app, upiShopper.headers, upiOrder.id, { method: 'UPI', upiId: 'asha.rao@okaxis' });
    expect(upiRes.body.payment).toMatchObject({ upiHandleMasked: 'as***@okaxis', cardLast4: null });

    const cardShopper = await createShopper({ cart: [[POETRY, 1]] });
    const cardOrder = await checkoutCart(app, cardShopper.headers);
    const cardRes = await payOrder(app, cardShopper.headers, cardOrder.id, { method: 'DEBIT_CARD', card });
    expect(cardRes.body.payment.cardLast4).toBe('1234');

    const [hits] = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM payments
      WHERE card_last4 LIKE '%4111%' OR upi_handle_masked LIKE '%asha.rao%' OR failure_reason LIKE '%987%'`;
    expect(hits.count).toBe(0);
    const body = JSON.stringify(cardRes.body);
    expect(body).not.toMatch(/4111.?1111/);
    expect(body).not.toMatch(/cvv|nameOnCard|"number"/i);
  });

  test('eBook-only order is delivered instantly', async () => {
    const { headers } = await createShopper({ cart: [[EBOOK, 1]] });
    const order = await checkoutCart(app, headers);
    const res = await payOrder(app, headers, order.id);
    expect(res.body.order.status).toBe('DELIVERED');
    expect(res.body.order.shipments[0]).toMatchObject({ status: 'DELIVERED' });
    expect(res.body.order.shipments[0].actualDelivery).toBeTruthy();
    expect(res.body.order.shipments[0].events.map((e) => e.status)).toEqual(['PROCESSING', 'DELIVERED']);
  });

  test('WALLET debits the balance', async () => {
    const { user, headers } = await createShopper({ cart: [[POETRY, 1]], walletBalancePaise: 100000 });
    const order = await checkoutCart(app, headers);
    const res = await payOrder(app, headers, order.id, { method: 'WALLET' });
    expect(res.body.success).toBe(true);
    expect((await prisma.user.findUnique({ where: { id: user.id } })).walletBalancePaise).toBe(100000 - order.totals.totalPaise);
  });

  test('a session cannot be confirmed twice', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers);
    const session = await initiate(headers, { orderId: order.id, method: 'UPI' });
    expect((await confirm(headers, { sessionId: session.body.sessionId, upiId: 'a.b@okaxis' })).body.success).toBe(true);
    const again = await confirm(headers, { sessionId: session.body.sessionId, upiId: 'a.b@okaxis' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYMENT_ALREADY_PROCESSED');
  });

  test('paying a confirmed order again is 409', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers);
    await payOrder(app, headers, order.id);
    const res = await initiate(headers, { orderId: order.id, method: 'UPI' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_PENDING');
  });
});

describe('POST /api/payments/confirm — failures', () => {
  test('forceFailure → FAILED, order stays PENDING, retry succeeds', async () => {
    const { user, headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers);

    const failed = await payOrder(app, headers, order.id, { forceFailure: true });
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({ success: false, reason: 'Payment declined' });
    expect(failed.body.payment).toMatchObject({ status: 'FAILED', failureReason: 'Payment declined' });
    expect(failed.body.order).toMatchObject({ status: 'PENDING', paymentStatus: 'FAILED', shipments: [] });
    expect(await prisma.cartItem.count({ where: { userId: user.id } })).toBe(1);

    const retry = await payOrder(app, headers, order.id);
    expect(retry.body.success).toBe(true);
    expect(retry.body.order).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(retry.body.order.payments.map((p) => p.status)).toEqual(['FAILED', 'SUCCEEDED']);
  });

  test('expired reservation at confirm time is 409', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers);
    const session = await initiate(headers, { orderId: order.id, method: 'UPI' });
    await prisma.order.update({ where: { id: order.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });

    const res = await confirm(headers, { sessionId: session.body.sessionId, upiId: 'a.b@okaxis' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESERVATION_EXPIRED');
    expect((await prisma.order.findUnique({ where: { id: order.id } })).status).toBe('EXPIRED');
    expect((await prisma.payment.findFirst({ where: { orderId: order.id } })).status).toBe('FAILED');
  });

  test('insufficient wallet balance → FAILED and nothing is consumed', async () => {
    const { user, headers } = await createShopper({ cart: [[BIO, 1]], walletBalancePaise: 1000, giftPoints: 20 });
    const order = await checkoutCart(app, headers, { giftPointsToRedeem: 20 });
    const res = await payOrder(app, headers, order.id, { method: 'WALLET' });

    expect(res.body).toMatchObject({ success: false, reason: 'Insufficient wallet balance' });
    expect(res.body.order.status).toBe('PENDING');
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after).toMatchObject({ walletBalancePaise: 1000, giftPoints: 20 });
    expect(await prisma.giftPointTransaction.count({ where: { orderId: order.id } })).toBe(0);
  });

  test('coupon used up between checkout and payment → FAILED', async () => {
    const code = `T${randomUUID().slice(0, 8).toUpperCase()}`;
    await prisma.coupon.create({
      data: { code, discountType: 'FLAT', discountValue: 1000, usageLimit: 1, validUntil: new Date(Date.now() + 86_400_000) },
    });
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers, { couponCode: code });
    await prisma.coupon.update({ where: { code }, data: { usedCount: 1 } });

    const res = await payOrder(app, headers, order.id);
    expect(res.body).toMatchObject({ success: false, reason: 'Coupon usage limit reached' });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.coupon.delete({ where: { code } });
  });

  test('card method without card details is 400', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers);
    const session = await initiate(headers, { orderId: order.id, method: 'CREDIT_CARD' });
    const res = await confirm(headers, { sessionId: session.body.sessionId });
    expect(res.status).toBe(400);
  });

  test("another user's session is 404", async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers);
    const session = await initiate(headers, { orderId: order.id, method: 'UPI' });
    const stranger = await createShopper();
    expect((await confirm(stranger.headers, { sessionId: session.body.sessionId, upiId: 'a.b@okaxis' })).status).toBe(404);
    expect((await confirm(stranger.headers, { sessionId: randomUUID(), upiId: 'a.b@okaxis' })).status).toBe(404);
  });
});

describe('GET /api/payments/wallet', () => {
  test('returns points and balance for registered users', async () => {
    const { headers } = await createShopper({ giftPoints: 200, walletBalancePaise: 100000 });
    const res = await request(app).get('/api/payments/wallet').set(headers);
    expect(res.body).toEqual({
      giftPoints: 200,
      giftPointsValuePaise: 20000,
      giftPointsValueInr: '₹200',
      walletBalancePaise: 100000,
      walletBalanceInr: '₹1,000',
    });
  });

  test('guests are 403, anonymous 401', async () => {
    const { headers } = await createShopper({ role: 'GUEST' });
    expect((await request(app).get('/api/payments/wallet').set(headers)).status).toBe(403);
    expect((await request(app).get('/api/payments/wallet')).status).toBe(401);
  });
});

test('maskUpi keeps the first two characters and the bank', () => {
  expect(maskUpi('john@okaxis')).toBe('jo***@okaxis');
});
