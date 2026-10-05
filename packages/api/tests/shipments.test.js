import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authHeader, checkoutCart, createShopper, loginAs, payOrder } from './factories.js';

const app = createApp();
const POETRY = 'rain-on-tin-roofs';
let admin;

const rate = (body) => request(app).post('/api/shipments/calculate-rate').send(body);
const advance = (shipmentId, headers = admin) => request(app).post(`/api/admin/shipments/${shipmentId}/advance`).set(headers);

async function paidOrder() {
  const shopper = await createShopper({ cart: [[POETRY, 1]] });
  const order = await checkoutCart(app, shopper.headers);
  const paid = await payOrder(app, shopper.headers, order.id);
  return { ...shopper, order: paid.body.order, shipment: paid.body.order.shipments[0] };
}

beforeAll(async () => {
  admin = authHeader(await loginAs(app, 'admin@bookworm.com', 'Admin@1234'));
});

describe('POST /api/shipments/calculate-rate', () => {
  test.each([
    [{ subtotalPaise: 49900 }, 4900, false],
    [{ subtotalPaise: 50000 }, 0, true],
    [{ subtotalPaise: 0 }, 4900, false],
    [{ subtotalPaise: 9900, allDigital: true }, 0, true],
  ])('%o → %i paise', async (body, expected, free) => {
    const res = await rate(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ shippingRatePaise: expected, freeShippingEligible: free });
    expect(res.body.shippingRateInr).toBe(expected ? '₹49' : '₹0');
  });

  test('ETA is 3 business days out and never on a weekend', async () => {
    const res = await rate({ subtotalPaise: 30000 });
    const eta = new Date(res.body.estimatedDelivery);
    expect([0, 6]).not.toContain(eta.getDay());
    expect(eta.getTime() - Date.now()).toBeGreaterThanOrEqual(3 * 24 * 60 * 60 * 1000 - 60_000);
    expect(res.body.estimatedDeliveryText).toMatch(/^Delivery by \w{3}, \d{1,2} \w{3}$/);
  });

  test('eBook-only orders say instant download', async () => {
    const res = await rate({ subtotalPaise: 9900, allDigital: true });
    expect(res.body.estimatedDeliveryText).toBe('Instant download');
  });

  test('is public and validates input', async () => {
    expect((await rate({})).status).toBe(400);
    expect((await rate({ subtotalPaise: -5 })).status).toBe(400);
  });
});

describe('GET /api/shipments/order/:orderId', () => {
  test('returns the tracking timeline to the owner', async () => {
    const { headers, order } = await paidOrder();
    const res = await request(app).get(`/api/shipments/order/${order.id}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ type: 'FORWARD', status: 'PROCESSING' });
    expect(res.body.items[0].trackingNumber).toMatch(/^TRK-/);
    expect(res.body.items[0].events[0]).toMatchObject({ status: 'PROCESSING', note: 'Order confirmed and being packed' });
  });

  test("someone else's order is 404", async () => {
    const { order } = await paidOrder();
    const stranger = await createShopper();
    expect((await request(app).get(`/api/shipments/order/${order.id}`).set(stranger.headers)).status).toBe(404);
    expect((await request(app).get(`/api/shipments/order/${randomUUID()}`).set(stranger.headers)).status).toBe(404);
    expect((await request(app).get(`/api/shipments/order/${order.id}`)).status).toBe(401);
  });
});

describe('POST /api/admin/shipments/:id/advance', () => {
  test('walks PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED and syncs the order', async () => {
    const { order, shipment } = await paidOrder();

    const first = await advance(shipment.id);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ shipment: { status: 'SHIPPED' }, orderStatus: 'SHIPPED' });

    const second = await advance(shipment.id);
    expect(second.body).toMatchObject({ shipment: { status: 'OUT_FOR_DELIVERY' }, orderStatus: 'SHIPPED' });

    const third = await advance(shipment.id);
    expect(third.body).toMatchObject({ shipment: { status: 'DELIVERED' }, orderStatus: 'DELIVERED' });
    expect(third.body.shipment.actualDelivery).toBeTruthy();
    expect(third.body.shipment.events.map((e) => e.status)).toEqual(['PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']);

    const stored = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });
    expect(stored.status).toBe('DELIVERED');
    expect(stored.items.every((i) => i.deliveryDate)).toBe(true);

    const fourth = await advance(shipment.id);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe('SHIPMENT_DELIVERED');
  });

  test('a cancelled order cannot be shipped', async () => {
    const { order, shipment } = await paidOrder();
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    const res = await advance(shipment.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_SHIPPABLE');
  });

  test('admin only; unknown shipment is 404', async () => {
    const { headers, shipment } = await paidOrder();
    expect((await advance(shipment.id, headers)).status).toBe(403);
    expect((await advance(shipment.id, {})).status).toBe(401);
    expect((await advance(randomUUID())).status).toBe(404);
  });
});
