import { estimateDelivery } from 'bookworm-shared';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { TEST_ADDRESS, checkoutCart, createShopper, payOrder } from './factories.js';

const app = createApp();
const POETRY = 'rain-on-tin-roofs';
const EBOOK = 'the-vanishing-house';

const checkout = (headers, body) =>
  request(app).post('/api/orders/checkout').set(headers).send({ address: TEST_ADDRESS, paymentMethod: 'UPI', ...body });

describe('PIN-based delivery estimates', () => {
  test('checkout refuses an unserviceable PIN for printed books', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const res = await checkout(headers, { address: { ...TEST_ADDRESS, pin: '999001' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'PIN_NOT_SERVICEABLE', details: { pin: '999001' } });
  });

  test('eBook-only orders do not need a serviceable PIN', async () => {
    const { headers } = await createShopper({ cart: [[EBOOK, 1]] });
    const res = await checkout(headers, { address: { ...TEST_ADDRESS, pin: '999001' } });
    expect(res.status).toBe(201);
  });

  test('payment commits the latest date for the order PIN on the shipment and items', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers, { address: { ...TEST_ADDRESS, pin: '781001' } });
    const paid = await payOrder(app, headers, order.id);
    const expected = estimateDelivery({ pin: '781001' });

    const [shipment] = paid.body.order.shipments;
    expect(shipment.estimatedDelivery).toBe(expected.latest.toISOString());
    expect(paid.body.order.items[0].deliveryDate).toBe(expected.latest.toISOString());
  });

  test('changing the address re-estimates the delivery date; unserviceable PINs are refused', async () => {
    const { headers } = await createShopper({ cart: [[POETRY, 1]] });
    const order = await checkoutCart(app, headers, { address: { ...TEST_ADDRESS, pin: '560001' } });
    await payOrder(app, headers, order.id);
    const before = await prisma.shipment.findFirst({ where: { orderId: order.id } });

    const blocked = await request(app).patch(`/api/orders/${order.id}/address`).set(headers).send({ ...TEST_ADDRESS, pin: '999001' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('PIN_NOT_SERVICEABLE');

    const res = await request(app).patch(`/api/orders/${order.id}/address`).set(headers).send({ ...TEST_ADDRESS, pin: '781001' });
    expect(res.status).toBe(200);
    const expected = estimateDelivery({ pin: '781001' }).latest.toISOString();
    expect(res.body.shipments[0].estimatedDelivery).toBe(expected);
    expect(res.body.items[0].deliveryDate).toBe(expected);
    expect(new Date(expected) > before.estimatedDelivery).toBe(true);
  });
});
