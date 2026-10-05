import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { verifyToken } from '../src/lib/jwt.js';
import { prisma } from '../src/lib/prisma.js';
import { TEST_ADDRESS, authHeader, checkoutCart, createShopper, loginAs, payOrder } from './factories.js';

const app = createApp();
const POETRY = 'rain-on-tin-roofs';
const PHONE_LAST4 = TEST_ADDRESS.phone.slice(-4);
const verify = (body, target = app) => request(target).post('/api/orders/lookup/verify').send(body);

/** A guest who placed and paid for an order in a session that has since ended. */
async function paidGuestOrder(quantity = 3) {
  const guest = await createShopper({ role: 'GUEST', cart: [[POETRY, quantity]] });
  const order = await checkoutCart(app, guest.headers);
  const paid = await payOrder(app, guest.headers, order.id);
  if (!paid.body.success) throw new Error('payment failed');
  return { guest, order };
}

const accessFor = async ({ guest, order }) => {
  const res = await verify({ email: guest.email, orderNumber: order.orderNumber, phoneLast4: PHONE_LAST4 });
  expect(res.status).toBe(200);
  return res.body;
};

describe('POST /api/orders/lookup/verify', () => {
  test('returns an order-scoped 30-minute token, the full order and the waiting gift points', async () => {
    const placed = await paidGuestOrder();
    const res = await verify({
      email: placed.guest.email.toUpperCase(),
      orderNumber: placed.order.orderNumber.toLowerCase(),
      phoneLast4: PHONE_LAST4,
    });

    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ id: placed.order.id, status: 'CONFIRMED', flags: { canCancel: true } });
    expect(res.body.order.totals.giftPointsEarned).toBeGreaterThan(0);
    expect(res.body.giftPoints).toBe(res.body.order.totals.giftPointsEarned);

    const claims = verifyToken(res.body.token);
    expect(claims).toMatchObject({ sub: placed.guest.user.id, role: 'GUEST', oid: placed.order.id, scope: 'order' });
    expect(claims.exp - claims.iat).toBe(30 * 60);
    expect(claims).not.toHaveProperty('gsid');
  });

  test('wrong phone, email or order number is the same generic 404', async () => {
    const { guest, order } = await paidGuestOrder(1);
    const wrongPhone = await verify({ email: guest.email, orderNumber: order.orderNumber, phoneLast4: '0000' });
    const wrongEmail = await verify({ email: 'x@example.com', orderNumber: order.orderNumber, phoneLast4: PHONE_LAST4 });
    const wrongNumber = await verify({ email: guest.email, orderNumber: 'BW-00000000', phoneLast4: PHONE_LAST4 });

    for (const res of [wrongPhone, wrongEmail, wrongNumber]) expect(res.status).toBe(404);
    expect(wrongPhone.body).toEqual(wrongEmail.body);
    expect(wrongPhone.body).toEqual(wrongNumber.body);
  });

  test('orders of registered accounts must be managed after logging in (409 ACCOUNT_ORDER)', async () => {
    const shopper = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, shopper.headers);
    const res = await verify({ email: shopper.email, orderNumber: order.orderNumber, phoneLast4: PHONE_LAST4 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_ORDER');
  });

  test('validates input and shares the lookup rate limit', async () => {
    const base = { email: 'customer@test.com', orderNumber: 'BW-SEED000B' };
    expect((await verify({ ...base, phoneLast4: '12' })).status).toBe(400);
    expect((await verify(base)).status).toBe(400);

    const limited = createApp({ lookupLimit: 2 });
    await request(limited).post('/api/orders/lookup').send(base);
    await verify({ ...base, phoneLast4: '1234' }, limited);
    const third = await verify({ ...base, phoneLast4: '1234' }, limited);
    expect(third.status).toBe(429);
  });
});

describe('order-scoped token', () => {
  test('lets the guest view, track, change the address of and cancel that order', async () => {
    const placed = await paidGuestOrder(1);
    const headers = authHeader((await accessFor(placed)).token);
    const id = placed.order.id;

    expect((await request(app).get(`/api/orders/${id}`).set(headers)).status).toBe(200);
    expect((await request(app).get(`/api/shipments/order/${id}`).set(headers)).status).toBe(200);

    const moved = await request(app)
      .patch(`/api/orders/${id}/address`)
      .set(headers)
      .send({ ...TEST_ADDRESS, line1: '99 New Street' });
    expect(moved.status).toBe(200);
    expect(moved.body.shippingAddress.line1).toBe('99 New Street');

    const cancelled = await request(app).post(`/api/orders/${id}/cancel`).set(headers);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  test("can't reach the guest's other orders", async () => {
    const first = await paidGuestOrder(1);
    await request(app).post('/api/cart/items').set(first.guest.headers).send({ bookId: first.order.items[0].bookId, quantity: 1 });
    const other = await checkoutCart(app, first.guest.headers);
    const headers = authHeader((await accessFor(first)).token);
    expect((await request(app).get(`/api/orders/${other.id}`).set(headers)).status).toBe(404);
  });

  test('is refused everywhere else with 403 ORDER_SCOPE_ONLY', async () => {
    const headers = authHeader((await accessFor(await paidGuestOrder(1))).token);
    const res = await request(app).get('/api/wishlist').set(headers);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORDER_SCOPE_ONLY');
  });
});

describe('claiming the guest account', () => {
  const password = { password: 'Reader@123', confirmPassword: 'Reader@123' };

  test('set-password with an order token converts the guest and keeps the gift points', async () => {
    const placed = await paidGuestOrder();
    const access = await accessFor(placed);

    const claimed = await request(app).put('/api/auth/set-password').set(authHeader(access.token)).send(password);
    expect(claimed.status).toBe(200);
    expect(claimed.body.user).toMatchObject({ id: placed.guest.user.id, role: 'CUSTOMER', giftPoints: access.giftPoints });

    const token = await loginAs(app, placed.guest.email, 'Reader@123');
    const wallet = await request(app).get('/api/payments/wallet').set(authHeader(token));
    expect(wallet.status).toBe(200);
    expect(wallet.body.giftPoints).toBe(access.giftPoints);

    const again = await request(app).put('/api/auth/set-password').set(authHeader(access.token)).send(password);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('ALREADY_REGISTERED');

    const after = await verify({ email: placed.guest.email, orderNumber: placed.order.orderNumber, phoneLast4: PHONE_LAST4 });
    expect(after.status).toBe(409);
  });

  test('an unpaid order is not proof enough (403 NO_GUEST_ORDER)', async () => {
    const guest = await createShopper({ role: 'GUEST', cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, guest.headers);
    const access = await accessFor({ guest, order });
    const res = await request(app).put('/api/auth/set-password').set(authHeader(access.token)).send(password);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NO_GUEST_ORDER');
    expect((await prisma.user.findUnique({ where: { id: guest.user.id } })).role).toBe('GUEST');
  });

  test('registering with a guest e-mail points to Track Order (409 GUEST_ACCOUNT)', async () => {
    const { guest } = await paidGuestOrder(1);
    const res = await request(app).post('/api/auth/register').send({
      email: guest.email,
      password: 'Reader@123',
      firstName: 'Asha',
      lastName: 'Rao',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'GUEST_ACCOUNT', message: expect.stringMatching(/Track Order/) });
  });
});
