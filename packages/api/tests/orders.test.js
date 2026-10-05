import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { TEST_ADDRESS, authHeader, checkoutCart, createShopper, loginAs, payOrder } from './factories.js';

const app = createApp();
const bookId = (slug) => stableId('book', slug);
const POETRY = 'rain-on-tin-roofs'; // ₹199 paperback
const EBOOK = 'the-last-act';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let admin;

const get = (path, headers) => request(app).get(`/api${path}`).set(headers);
const post = (path, headers) => request(app).post(`/api${path}`).set(headers);
const advance = (shipmentId) => request(app).post(`/api/admin/shipments/${shipmentId}/advance`).set(admin);
const stockOf = async (slug) => (await prisma.book.findUnique({ where: { id: bookId(slug) } })).stockQuantity;

async function paidOrder({ cart = [[POETRY, 1]], method = 'UPI', ...shopperOverrides } = {}, checkoutBody = {}) {
  const shopper = await createShopper({ cart, ...shopperOverrides });
  const pending = await checkoutCart(app, shopper.headers, checkoutBody);
  const paid = await payOrder(app, shopper.headers, pending.id, { method });
  return { ...shopper, order: paid.body.order };
}

async function deliveredOrder(daysAgo = 0) {
  const result = await paidOrder();
  const shipmentId = result.order.shipments[0].id;
  for (let i = 0; i < 3; i += 1) await advance(shipmentId);
  if (daysAgo) {
    await prisma.shipment.update({ where: { id: shipmentId }, data: { actualDelivery: new Date(Date.now() - daysAgo * DAY) } });
  }
  return result;
}

beforeAll(async () => {
  admin = authHeader(await loginAs(app, 'admin@bookworm.com', 'Admin@1234'));
});

describe('GET /api/orders', () => {
  test('customer sees the 2 seeded orders, newest first, with flags', async () => {
    const headers = authHeader(await loginAs(app, 'customer@test.com'));
    const res = await get('/orders', headers);
    expect(res.status).toBe(200);
    const seeded = res.body.items.filter((o) => o.orderNumber.startsWith('BW-SEED'));
    expect(seeded.map((o) => o.orderNumber)).toEqual(['BW-SEED000B', 'BW-SEED000A']);

    const [b, a] = seeded;
    expect(a.flags).toEqual({ canCancel: false, canReturn: false, canModifyAddress: false });
    expect(b.flags).toMatchObject({ canCancel: false, canReturn: true });
    expect(a.items[0]).toMatchObject({ coverImageUrl: expect.stringContaining('picsum'), authorName: 'Daniel Reed' });
  });

  test('paginates and hides never-paid cancelled/expired checkouts', async () => {
    const { headers } = await paidOrder();
    const second = await createShopper({ cart: [[POETRY, 1]] });
    await checkoutCart(app, second.headers);
    await checkoutCart(app, second.headers); // replaces the first → CANCELLED, never paid

    const res = await get('/orders?page=1&pageSize=1', headers);
    expect(res.body).toMatchObject({ page: 1, pageSize: 1, total: 1, totalPages: 1 });

    const replaced = await get('/orders', second.headers);
    expect(replaced.body.items.map((o) => o.status)).toEqual(['PENDING']);
  });

  test('guests are 403, anonymous 401', async () => {
    const { headers } = await createShopper({ role: 'GUEST' });
    expect((await get('/orders', headers)).status).toBe(403);
    expect((await get('/orders', {})).status).toBe(401);
  });
});

describe('GET /api/orders/:orderId', () => {
  test('returns items, address snapshot, payment and shipments', async () => {
    const { headers, order } = await paidOrder({ method: 'CREDIT_CARD' });
    const res = await get(`/orders/${order.id}`, headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: order.id,
      status: 'CONFIRMED',
      paymentMethod: 'CREDIT_CARD',
      shippingAddress: { line1: TEST_ADDRESS.line1, pin: TEST_ADDRESS.pin },
      payments: [{ status: 'SUCCEEDED', cardLast4: '4242' }],
      flags: { canCancel: true, canReturn: false, canModifyAddress: true },
    });
    expect(res.body.shipments[0].events).toHaveLength(1);
  });

  test("other user's order is 404; malformed id is 400", async () => {
    const { order } = await paidOrder();
    const stranger = await createShopper();
    expect((await get(`/orders/${order.id}`, stranger.headers)).status).toBe(404);
    expect((await get(`/orders/${randomUUID()}`, stranger.headers)).status).toBe(404);
    expect((await get('/orders/nope', stranger.headers)).status).toBe(400);
  });
});

describe('POST /api/orders/:orderId/cancel', () => {
  test('confirmed order: restock, points back and reversed, coupon freed, payment refunded to wallet', async () => {
    const { user, headers, order } = await paidOrder(
      { cart: [[POETRY, 3]], method: 'WALLET', giftPoints: 50, walletBalancePaise: 200000 },
      { couponCode: 'WELCOME50', giftPointsToRedeem: 50, paymentMethod: 'WALLET' },
    );
    const stock = await stockOf(POETRY);
    const coupon = await prisma.coupon.findUnique({ where: { code: 'WELCOME50' } });
    const before = await prisma.user.findUnique({ where: { id: user.id } });

    const res = await post(`/orders/${order.id}/cancel`, headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    expect(res.body.cancelledAt).toBeTruthy();
    expect(res.body.payments[0]).toMatchObject({ status: 'REFUNDED' });
    expect(res.body.flags.canCancel).toBe(false);

    expect(await stockOf(POETRY)).toBe(stock + 3);
    expect((await prisma.coupon.findUnique({ where: { code: 'WELCOME50' } })).usedCount).toBe(coupon.usedCount - 1);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.walletBalancePaise).toBe(before.walletBalancePaise + order.totals.totalPaise);
    expect(after.giftPoints).toBe(before.giftPoints + 50 - order.totals.giftPointsEarned);
    expect(after.giftPoints).toBe(50);
  });

  test('pending (unpaid) order just releases its stock', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 2]] });
    const order = await checkoutCart(app, headers);
    const stock = await stockOf(POETRY);
    const res = await post(`/orders/${order.id}/cancel`, headers);
    expect(res.body).toMatchObject({ status: 'CANCELLED', paymentStatus: 'UNPAID' });
    expect(await stockOf(POETRY)).toBe(stock + 2);
  });

  test('after shipping is 409', async () => {
    const { headers, order } = await paidOrder();
    await advance(order.shipments[0].id);
    const res = await post(`/orders/${order.id}/cancel`, headers);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_CANCEL');
  });

  test('after 48 hours is 409', async () => {
    const { headers, order } = await paidOrder();
    await prisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 49 * HOUR) } });
    expect((await post(`/orders/${order.id}/cancel`, headers)).status).toBe(409);
  });

  test("other user's order is 404", async () => {
    const { order } = await paidOrder();
    const stranger = await createShopper();
    expect((await post(`/orders/${order.id}/cancel`, stranger.headers)).status).toBe(404);
  });

  test('guests can cancel orders from their own session', async () => {
    const guest = await createShopper({ role: 'GUEST', cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, guest.headers);
    await payOrder(app, guest.headers, order.id);
    const res = await post(`/orders/${order.id}/cancel`, guest.headers);
    expect(res.body.status).toBe('CANCELLED');
  });
});

describe('POST /api/orders/:orderId/return', () => {
  test('delivered order → RETURN_REQUESTED with a RETURN shipment; receiving it refunds', async () => {
    const { headers, order } = await deliveredOrder(2);
    const stock = await stockOf(POETRY);

    const res = await post(`/orders/${order.id}/return`, headers);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RETURN_REQUESTED');
    const returnShipment = res.body.shipments.find((s) => s.type === 'RETURN');
    expect(returnShipment).toMatchObject({ status: 'PROCESSING' });
    expect(returnShipment.trackingNumber).toMatch(/^TRK-/);

    for (let i = 0; i < 2; i += 1) await advance(returnShipment.id);
    const last = await advance(returnShipment.id);
    expect(last.body).toMatchObject({ shipment: { status: 'DELIVERED' }, orderStatus: 'RETURNED' });

    const final = await get(`/orders/${order.id}`, headers);
    expect(final.body).toMatchObject({ status: 'RETURNED', paymentStatus: 'REFUNDED' });
    expect(await stockOf(POETRY)).toBe(stock + 1);
  });

  test('seeded Order B is returnable, Order A is not', async () => {
    const headers = authHeader(await loginAs(app, 'customer@test.com'));
    const orderA = stableId('order', 'seed-order-a');
    const res = await post(`/orders/${orderA}/return`, headers);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_RETURN');

    const b = await get(`/orders/${stableId('order', 'seed-order-b')}`, headers);
    expect(b.body.flags.canReturn).toBe(true);
  });

  test('more than 7 days after delivery is 409', async () => {
    const { headers, order } = await deliveredOrder(8);
    expect((await post(`/orders/${order.id}/return`, headers)).status).toBe(409);
  });

  test('not yet delivered is 409; eBook-only orders cannot be returned', async () => {
    const { headers, order } = await paidOrder();
    expect((await post(`/orders/${order.id}/return`, headers)).status).toBe(409);

    const ebook = await paidOrder({ cart: [[EBOOK, 1]] });
    expect(ebook.order.status).toBe('DELIVERED');
    expect(ebook.order.flags.canReturn).toBe(false);
    expect((await post(`/orders/${ebook.order.id}/return`, ebook.headers)).status).toBe(409);
  });
});

describe('PATCH /api/orders/:orderId/address', () => {
  const newAddress = { ...TEST_ADDRESS, line1: '99 New Street', pin: '600002' };

  test('changes the address while the order is still processing', async () => {
    const { headers, order } = await paidOrder();
    const res = await request(app).patch(`/api/orders/${order.id}/address`).set(headers).send(newAddress);
    expect(res.status).toBe(200);
    expect(res.body.shippingAddress).toMatchObject({ line1: '99 New Street', pin: '600002', country: 'India' });
  });

  test('after shipping is 409; invalid address is 400', async () => {
    const { headers, order } = await paidOrder();
    expect((await request(app).patch(`/api/orders/${order.id}/address`).set(headers).send({ ...newAddress, pin: '1' })).status).toBe(400);

    await advance(order.shipments[0].id);
    const res = await request(app).patch(`/api/orders/${order.id}/address`).set(headers).send(newAddress);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_MODIFY_ADDRESS');
  });

  test('unpaid orders cannot change address', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers);
    expect((await request(app).patch(`/api/orders/${order.id}/address`).set(headers).send(newAddress)).status).toBe(409);
  });
});
