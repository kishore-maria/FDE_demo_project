import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { generateOrderNumber } from 'bookworm-shared';
import { describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authHeader, createUser, loginAs, tokenFor } from './factories.js';

const app = createApp();
const bookId = (slug) => stableId('book', slug);
const titles = (res) => res.body.items.map((b) => b.title);
const recommended = (headers = {}) => request(app).get('/api/books/recommended').set(headers);

async function placeOrder(userId, slugs, status = 'DELIVERED') {
  await prisma.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      userId,
      contactEmail: 'test@test.bookworm',
      shippingAddress: {},
      subtotalPaise: 0,
      taxPaise: 0,
      deliveryChargePaise: 0,
      totalPaise: 0,
      status,
      items: {
        create: slugs.map((slug) => ({ bookId: bookId(slug), titleSnapshot: slug, quantity: 1, priceAtPurchasePaise: 0 })),
      },
    },
  });
}

describe('GET /api/books/recommended', () => {
  const editorsPicks = ['The Art of Focus', 'The Art of Learning', 'The Path to Success'];

  test('anonymous visitors get editor\'s picks', async () => {
    const res = await recommended();
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('editors_pick');
    expect(titles(res).sort()).toEqual(editorsPicks);
  });

  test('a registered user without purchases gets editor\'s picks', async () => {
    const token = await loginAs(app, 'fresh@test.com');
    const res = await recommended(authHeader(token));
    expect(res.body.source).toBe('editors_pick');
    expect(titles(res).sort()).toEqual(editorsPicks);
  });

  test('guests get editor\'s picks', async () => {
    const { user } = await createUser({ role: 'GUEST' });
    const res = await recommended(authHeader(tokenFor(user, { gsid: randomUUID() })));
    expect(res.body.source).toBe('editors_pick');
  });

  test('customer gets personalised picks that skip books already bought', async () => {
    const token = await loginAs(app, 'customer@test.com');
    const res = await recommended(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('personalised');
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.length).toBeLessThanOrEqual(10);

    const got = titles(res);
    for (const bought of ['Less, But Better', 'The Focus Reset', 'The Silent Witness', 'Shadows on the Lake']) {
      expect(got).not.toContain(bought);
    }
    expect(got).toEqual(expect.arrayContaining(['Joy of Minimalism', ...editorsPicks]));
    // Daniel Reed is followed and bought before, so his books outrank same-category ones.
    expect(res.body.items[0].author.name).toBe('Daniel Reed');
  });

  test('scores category and author affinity from purchases', async () => {
    const { user } = await createUser();
    await placeOrder(user.id, ['the-final-frontier']);
    const res = await recommended(authHeader(tokenFor(user)));

    expect(res.body.source).toBe('personalised');
    expect(titles(res)).not.toContain('The Final Frontier');
    // Same author (Laura Mitchell) and same genre (Science Fiction) beats everything else.
    expect(res.body.items[0].title).toBe('Orbit of Echoes');
    expect(res.body.items.slice(0, 4).map((b) => b.author.name)).toContain('Laura Mitchell');
  });

  test('out-of-stock books are not recommended', async () => {
    const { user } = await createUser();
    await placeOrder(user.id, ['the-final-frontier']);
    await prisma.book.update({ where: { id: bookId('orbit-of-echoes') }, data: { stockQuantity: 0 } });
    try {
      const res = await recommended(authHeader(tokenFor(user)));
      expect(titles(res)).not.toContain('Orbit of Echoes');
    } finally {
      await prisma.book.update({ where: { id: bookId('orbit-of-echoes') }, data: { stockQuantity: 100 } });
    }
  });

  test('cancelled orders do not count as purchase history', async () => {
    const { user } = await createUser();
    await placeOrder(user.id, ['the-final-frontier'], 'CANCELLED');
    const res = await recommended(authHeader(tokenFor(user)));
    expect(res.body.source).toBe('editors_pick');
  });

  test('response is plain JSON (no BigInt serialisation errors)', async () => {
    const token = await loginAs(app, 'customer@test.com');
    const res = await recommended(authHeader(token));
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(() => JSON.parse(res.text)).not.toThrow();
    expect(JSON.parse(res.text).items.every((b) => typeof b.salesCount === 'number')).toBe(true);
  });
});

describe('GET /api/books/bestsellers', () => {
  test('top 12 by copies sold, design bestsellers first', async () => {
    const res = await request(app).get('/api/books/bestsellers');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(12);
    expect(titles(res).slice(0, 3)).toEqual(['The Midnight Hour', 'Beneath the Stars', 'The Final Frontier']);
    const sales = res.body.items.map((b) => b.salesCount);
    expect(sales).toEqual([...sales].sort((a, b) => b - a));
  });
});

describe('GET /api/books/new-launches', () => {
  test('12 most recently published, design new launches first', async () => {
    const res = await request(app).get('/api/books/new-launches');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(12);
    expect(titles(res).slice(0, 3)).toEqual(['Joy of Minimalism', 'The Vanishing House', 'The Lost Kitten']);
  });

  test('static paths are not swallowed by /books/:bookId', async () => {
    const res = await request(app).get('/api/books/new-launches');
    expect(res.body.items).toBeDefined();
    expect(res.body.error).toBeUndefined();
  });
});
