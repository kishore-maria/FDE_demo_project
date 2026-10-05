import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { TEST_ADDRESS, authHeader, checkoutCart, createShopper, loginAs, payOrder } from './factories.js';

const app = createApp();
const POETRY = 'rain-on-tin-roofs';
const lookup = (body, target = app) => request(target).post('/api/orders/lookup').send(body);
const setPassword = (headers, body) => request(app).put('/api/auth/set-password').set(headers).send(body);

describe('guest checkout → track → convert', () => {
  test('full flow keeps the order on the converted account', async () => {
    const email = `reader-${randomUUID()}@example.com`;

    const session = await request(app).post('/api/auth/guest-session').send({ email });
    expect(session.status).toBe(200);
    expect(session.body.user.role).toBe('GUEST');
    const guest = authHeader(session.body.token);

    await request(app).post('/api/cart/merge').set(guest).send({ items: [{ bookId: stableId('book', POETRY), quantity: 2 }] });
    const order = await checkoutCart(app, guest, { address: { ...TEST_ADDRESS, email } });
    const paid = await payOrder(app, guest, order.id);
    expect(paid.body.success).toBe(true);

    const tracked = await lookup({ email: email.toUpperCase(), orderNumber: order.orderNumber.toLowerCase() });
    expect(tracked.status).toBe(200);
    expect(tracked.body).toMatchObject({ orderNumber: order.orderNumber, status: 'CONFIRMED', paymentStatus: 'PAID' });
    expect(tracked.body.shipments[0].trackingNumber).toMatch(/^TRK-/);
    expect(tracked.body).not.toHaveProperty('shippingAddress');
    expect(tracked.body).not.toHaveProperty('payments');

    const mismatch = await setPassword(guest, { password: 'Reader@123', confirmPassword: 'Reader@124' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('PASSWORDS_DO_NOT_MATCH');

    const converted = await setPassword(guest, { password: 'Reader@123', confirmPassword: 'Reader@123' });
    expect(converted.status).toBe(200);
    expect(converted.body.user).toMatchObject({ id: session.body.user.id, role: 'CUSTOMER', firstName: 'Asha', lastName: 'Rao' });

    const token = await loginAs(app, email, 'Reader@123');
    const history = await request(app).get('/api/orders').set(authHeader(token));
    expect(history.status).toBe(200);
    expect(history.body.items.map((o) => o.orderNumber)).toContain(order.orderNumber);

    const again = await request(app).post('/api/auth/guest-session').send({ email });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ACCOUNT_EXISTS');
  });
});

describe('POST /api/orders/lookup', () => {
  test('wrong email or order number is the same 404', async () => {
    const guest = await createShopper({ role: 'GUEST', cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, guest.headers);

    const wrongEmail = await lookup({ email: 'someone@else.com', orderNumber: order.orderNumber });
    const wrongNumber = await lookup({ email: guest.email, orderNumber: 'BW-00000000' });
    expect(wrongEmail.status).toBe(404);
    expect(wrongNumber.status).toBe(404);
    expect(wrongEmail.body).toEqual(wrongNumber.body);
  });

  test('works for seeded orders and needs no token', async () => {
    const res = await lookup({ email: 'customer@test.com', orderNumber: 'BW-SEED000B' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DELIVERED');
    expect(res.body.shipments[0].events).toHaveLength(4);
  });

  test('validates input', async () => {
    expect((await lookup({ email: 'not-an-email', orderNumber: 'BW-SEED000B' })).status).toBe(400);
    expect((await lookup({ email: 'customer@test.com', orderNumber: '12345' })).status).toBe(400);
  });

  test('is rate limited per app', async () => {
    const limited = createApp({ lookupLimit: 3 });
    const body = { email: 'customer@test.com', orderNumber: 'BW-SEED000B' };
    for (let i = 0; i < 3; i += 1) expect((await lookup(body, limited)).status).toBe(200);
    const fourth = await lookup(body, limited);
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('PUT /api/auth/set-password', () => {
  const body = { password: 'Reader@123', confirmPassword: 'Reader@123' };

  test('a guest session without a paid order is 403', async () => {
    const guest = await createShopper({ role: 'GUEST', cart: [[POETRY, 1]] });
    await checkoutCart(app, guest.headers); // pending only
    const res = await setPassword(guest.headers, body);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NO_GUEST_ORDER');
  });

  test('an order from a previous guest session does not count', async () => {
    const guest = await createShopper({ role: 'GUEST', cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, guest.headers);
    await payOrder(app, guest.headers, order.id);

    const newSession = await request(app).post('/api/auth/guest-session').send({ email: guest.email });
    const res = await setPassword(authHeader(newSession.body.token), body);
    expect(res.status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: guest.user.id } })).role).toBe('GUEST');
  });

  test('registered customers get 400; anonymous 401', async () => {
    const { headers } = await createShopper();
    const res = await setPassword(headers, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ALREADY_REGISTERED');
    expect((await request(app).put('/api/auth/set-password').send(body)).status).toBe(401);
  });

  test('weak password is 400', async () => {
    const guest = await createShopper({ role: 'GUEST' });
    expect((await setPassword(guest.headers, { password: 'short', confirmPassword: 'short' })).status).toBe(400);
  });
});
