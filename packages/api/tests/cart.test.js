import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authHeader, createOrder, createUser, loginAs, tokenFor } from './factories.js';

const app = createApp();
const bookId = (slug) => stableId('book', slug);
const JOY = 'joy-of-minimalism'; // ₹149
const PATH = 'the-path-to-success'; // ₹359

const api = (headers) => ({
  get: () => request(app).get('/api/cart').set(headers),
  clear: () => request(app).delete('/api/cart').set(headers),
  add: (slug, quantity) => request(app).post('/api/cart/items').set(headers).send({ bookId: bookId(slug), quantity }),
  update: (slug, quantity) => request(app).put(`/api/cart/items/${bookId(slug)}`).set(headers).send({ quantity }),
  remove: (slug) => request(app).delete(`/api/cart/items/${bookId(slug)}`).set(headers),
  merge: (items) => request(app).post('/api/cart/merge').set(headers).send({ items }),
  buyAgain: (orderId) => request(app).post(`/api/cart/buy-again/${orderId}`).set(headers),
});

async function newCart(role = 'CUSTOMER') {
  const { user } = await createUser({ role });
  const token = role === 'GUEST' ? tokenFor(user, { gsid: randomUUID() }) : tokenFor(user);
  return { user, cart: api(authHeader(token)) };
}

/** Temporarily sets a book's stock (restored afterwards) so tests can hit stock limits. */
async function withStock(slug, stockQuantity, fn) {
  const { stockQuantity: original } = await prisma.book.findUnique({ where: { id: bookId(slug) } });
  await prisma.book.update({ where: { id: bookId(slug) }, data: { stockQuantity } });
  try {
    return await fn();
  } finally {
    await prisma.book.update({ where: { id: bookId(slug) }, data: { stockQuantity: original } });
  }
}

const quantities = (res) => Object.fromEntries(res.body.items.map((i) => [i.book.slug, i.quantity]));

describe('cart basics', () => {
  test('requires a token', async () => {
    expect((await request(app).get('/api/cart')).status).toBe(401);
  });

  test('empty cart shape', async () => {
    const { cart } = await newCart();
    const res = await cart.get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], itemCount: 0, subtotalPaise: 0, subtotalInr: '₹0' });
  });

  test('adding the same book twice increments the quantity', async () => {
    const { cart } = await newCart();
    await cart.add(JOY, 1);
    const res = await cart.add(JOY, 2);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ quantity: 3, lineTotalPaise: 44700, lineTotalInr: '₹447' });
    expect(res.body.items[0].book).toMatchObject({ slug: JOY, priceInr: '₹149' });
    expect(res.body).toMatchObject({ itemCount: 3, subtotalPaise: 44700 });
  });

  test('quantity defaults to 1 and the design cart subtotal is ₹508', async () => {
    const { cart } = await newCart();
    await cart.add(JOY);
    const res = await cart.add(PATH);
    expect(quantities(res)).toEqual({ [JOY]: 1, [PATH]: 1 });
    expect(res.body).toMatchObject({ itemCount: 2, subtotalPaise: 50800, subtotalInr: '₹508' });
    expect(res.body.items.map((i) => i.book.slug)).toEqual([JOY, PATH]);
  });

  test('adding beyond stock is 409 INSUFFICIENT_STOCK and leaves the cart unchanged', async () => {
    const { cart } = await newCart();
    await cart.add(JOY, 99);
    const res = await cart.add(JOY, 2);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 100, requested: 101 } });
    expect(quantities(await cart.get())).toEqual({ [JOY]: 99 });
  });

  test('out-of-stock book cannot be added', async () => {
    const { cart } = await newCart();
    await withStock(JOY, 0, async () => {
      expect((await cart.add(JOY, 1)).status).toBe(409);
    });
  });

  test.each([
    ['unknown book', () => ({ bookId: randomUUID(), quantity: 1 }), 404],
    ['malformed id', () => ({ bookId: 'nope', quantity: 1 }), 400],
    ['quantity 0', () => ({ bookId: bookId(JOY), quantity: 0 }), 400],
    ['quantity 100', () => ({ bookId: bookId(JOY), quantity: 100 }), 400],
    ['unknown field', () => ({ bookId: bookId(JOY), price: 1 }), 400],
  ])('add with %s → %i', async (_label, body, status) => {
    const { user } = await createUser();
    const res = await request(app).post('/api/cart/items').set(authHeader(tokenFor(user))).send(body());
    expect(res.status).toBe(status);
  });
});

describe('update, remove, clear', () => {
  test('PUT sets the quantity, 0 removes the line', async () => {
    const { cart } = await newCart();
    await cart.add(JOY, 1);
    await cart.add(PATH, 1);

    expect(quantities(await cart.update(JOY, 5))).toEqual({ [JOY]: 5, [PATH]: 1 });
    expect(quantities(await cart.update(JOY, 0))).toEqual({ [PATH]: 1 });
  });

  test('PUT beyond stock is 409; unknown book is 404', async () => {
    const { cart } = await newCart();
    await cart.add(JOY, 1);
    await withStock(JOY, 3, async () => {
      const res = await cart.update(JOY, 5);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });
    const missing = await request(app)
      .put(`/api/cart/items/${randomUUID()}`)
      .set(authHeader(tokenFor((await createUser()).user)))
      .send({ quantity: 1 });
    expect(missing.status).toBe(404);
  });

  test('DELETE removes a line; removing it again is 404', async () => {
    const { cart } = await newCart();
    await cart.add(JOY, 1);
    const res = await cart.remove(JOY);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);

    const again = await cart.remove(JOY);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOT_IN_CART');
  });

  test('DELETE /cart empties everything', async () => {
    const { cart } = await newCart();
    await cart.add(JOY, 1);
    await cart.add(PATH, 2);
    const res = await cart.clear();
    expect(res.body).toMatchObject({ items: [], itemCount: 0, subtotalPaise: 0 });
  });

  test('carts are isolated per user', async () => {
    const a = await newCart();
    const b = await newCart();
    await a.cart.add(JOY, 2);
    expect((await b.cart.get()).body.items).toEqual([]);
    expect((await b.cart.remove(JOY)).status).toBe(404);
    expect(quantities(await a.cart.get())).toEqual({ [JOY]: 2 });
  });
});

describe('POST /api/cart/merge', () => {
  test('sums with the server cart and with duplicate lines', async () => {
    const { cart } = await newCart();
    await cart.add(JOY, 2);
    const res = await cart.merge([
      { bookId: bookId(JOY), quantity: 3 },
      { bookId: bookId(PATH), quantity: 1 },
      { bookId: bookId(PATH), quantity: 1 },
    ]);
    expect(res.status).toBe(200);
    expect(quantities(res)).toEqual({ [JOY]: 5, [PATH]: 2 });
    expect(res.body.skipped).toEqual([]);
  });

  test('caps at stock and reports skipped lines', async () => {
    const { cart } = await newCart();
    const unknown = randomUUID();
    await withStock(PATH, 4, () =>
      withStock('the-art-of-focus', 0, async () => {
        const res = await cart.merge([
          { bookId: bookId(PATH), quantity: 10 },
          { bookId: bookId('the-art-of-focus'), quantity: 1 },
          { bookId: unknown, quantity: 1 },
          { bookId: bookId(JOY), quantity: 1 },
        ]);
        expect(res.status).toBe(200);
        expect(quantities(res)).toEqual({ [PATH]: 4, [JOY]: 1 });
        expect(res.body.skipped).toEqual(
          expect.arrayContaining([
            { bookId: bookId(PATH), title: 'The Path to Success', reason: 'QUANTITY_CAPPED' },
            { bookId: bookId('the-art-of-focus'), title: 'The Art of Focus', reason: 'OUT_OF_STOCK' },
            { bookId: unknown, reason: 'NOT_FOUND' },
          ]),
        );
        expect(res.body.skipped).toHaveLength(3);
      }),
    );
  });

  test('empty merge returns the current cart', async () => {
    const { cart } = await newCart();
    await cart.add(JOY, 1);
    const res = await cart.merge([]);
    expect(quantities(res)).toEqual({ [JOY]: 1 });
    expect(res.body.skipped).toEqual([]);
  });

  test('guests have a server cart and can merge', async () => {
    const { cart } = await newCart('GUEST');
    const res = await cart.merge([{ bookId: bookId(JOY), quantity: 2 }]);
    expect(res.status).toBe(200);
    expect(quantities(await cart.get())).toEqual({ [JOY]: 2 });
  });

  test('rejects invalid payloads', async () => {
    const { cart } = await newCart();
    expect((await cart.merge([{ bookId: bookId(JOY), quantity: 0 }])).status).toBe(400);
    expect((await request(app).post('/api/cart/merge').set(authHeader(tokenFor((await createUser()).user))).send({})).status).toBe(400);
  });
});

describe('POST /api/cart/buy-again/:orderId', () => {
  const orderA = stableId('order', 'seed-order-a');
  let customerHeaders;

  afterAll(async () => {
    if (customerHeaders) await api(customerHeaders).clear();
  });

  test('re-adds the books from customer Order A', async () => {
    customerHeaders = authHeader(await loginAs(app, 'customer@test.com'));
    const cart = api(customerHeaders);
    await cart.clear();

    const res = await cart.buyAgain(orderA);
    expect(res.status).toBe(200);
    expect(quantities(res)).toEqual({ 'less-but-better': 1, 'the-focus-reset': 1 });
    expect(res.body.skipped).toEqual([]);
  });

  test('skips out-of-stock books and still adds the rest', async () => {
    const { user, cart } = await newCart();
    const order = await createOrder(user.id, [JOY, PATH]);
    await withStock(PATH, 0, async () => {
      const res = await cart.buyAgain(order.id);
      expect(quantities(res)).toEqual({ [JOY]: 1 });
      expect(res.body.skipped).toEqual([{ bookId: bookId(PATH), title: 'The Path to Success', reason: 'OUT_OF_STOCK' }]);
    });
  });

  test("another user's order is 404, unknown is 404, malformed is 400", async () => {
    const { cart } = await newCart();
    expect((await cart.buyAgain(orderA)).status).toBe(404);
    expect((await cart.buyAgain(randomUUID())).status).toBe(404);
    expect((await cart.buyAgain('not-a-uuid')).status).toBe(400);
  });

  test('guests cannot buy again', async () => {
    const { cart } = await newCart('GUEST');
    const res = await cart.buyAgain(orderA);
    expect(res.status).toBe(403);
  });
});
