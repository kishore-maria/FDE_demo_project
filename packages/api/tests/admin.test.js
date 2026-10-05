import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authHeader, checkoutCart, createShopper, loginAs, payOrder } from './factories.js';

const app = createApp();
let admin;
let customer;
const unique = () => randomUUID().slice(0, 8);

const call = (method, path, headers = admin) => request(app)[method](`/api/admin${path}`).set(headers);

beforeAll(async () => {
  admin = authHeader(await loginAs(app, 'admin@bookworm.com', 'Admin@1234'));
  customer = authHeader(await loginAs(app, 'customer@test.com'));
});

describe('admin access', () => {
  test.each(['/books', '/categories', '/publishers', '/authors', '/coupons', '/stores', '/orders'])(
    'GET %s is admin only',
    async (path) => {
      expect((await call('get', path, customer)).status).toBe(403);
      expect((await call('get', path, {})).status).toBe(401);
      expect((await call('get', path)).status).toBe(200);
    },
  );
});

describe('books', () => {
  const selfHelp = stableId('category', 'self-help');
  const nonFiction = stableId('category', 'non-fiction');

  function bookInput(overrides = {}) {
    const slug = `admin-book-${unique()}`;
    return {
      title: 'The Admin Handbook',
      slug,
      authorId: stableId('author', 'daniel-reed'),
      publisherId: stableId('publisher', 'abc-publishers'),
      shortDescription: 'A test book created by the admin API.',
      pricePaise: 25000,
      format: 'PAPERBACK',
      coverImageUrl: `https://picsum.photos/seed/${slug}-front/400/600`,
      publishedAt: new Date().toISOString(),
      categories: [{ categoryId: selfHelp, isPrimary: true }],
      relations: [{ relatedBookId: stableId('book', 'joy-of-minimalism'), type: 'CROSS_SELL' }],
      ...overrides,
    };
  }

  test('created book appears in the catalog with its relations', async () => {
    const input = bookInput();
    const res = await call('post', '/books').send(input);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'The Admin Handbook',
      description: input.shortDescription,
      stockQuantity: 100,
      breadcrumb: [{ slug: 'non-fiction' }, { slug: 'self-help' }],
      crossSell: [{ slug: 'joy-of-minimalism' }],
    });

    const search = await request(app).get('/api/books?search=admin%20handbook');
    expect(search.body.items.map((b) => b.slug)).toContain(input.slug);
    await prisma.book.delete({ where: { id: res.body.id } });
  });

  test('update replaces categories and fields; list searches by title', async () => {
    const created = await call('post', '/books').send(bookInput());
    const res = await call('put', `/books/${created.body.id}`).send({
      pricePaise: 19900,
      stockQuantity: 5,
      categories: [{ categoryId: nonFiction, isPrimary: true }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pricePaise: 19900, priceInr: '₹199', stockQuantity: 5 });
    expect(res.body.categories.map((c) => c.slug)).toEqual(['non-fiction']);

    const list = await call('get', '/books?search=admin%20handbook');
    expect(list.body.items.map((b) => b.id)).toContain(created.body.id);

    expect((await call('delete', `/books/${created.body.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/books/${created.body.id}`)).status).toBe(404);
  });

  test('validation: exactly one primary category, known references, unique slug', async () => {
    const noPrimary = await call('post', '/books').send(bookInput({ categories: [{ categoryId: selfHelp }] }));
    expect(noPrimary.status).toBe(400);

    const badAuthor = await call('post', '/books').send(bookInput({ authorId: randomUUID() }));
    expect(badAuthor.status).toBe(400);
    expect(badAuthor.body.error.code).toBe('INVALID_REFERENCE');

    const dupe = await call('post', '/books').send(bookInput({ slug: 'joy-of-minimalism' }));
    expect(dupe.status).toBe(409);
  });

  test('a book with orders cannot be deleted', async () => {
    const res = await call('delete', `/books/${stableId('book', 'less-but-better')}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOK_HAS_ORDERS');
    expect((await call('delete', `/books/${randomUUID()}`)).status).toBe(404);
  });
});

describe('categories', () => {
  test('CRUD with two-level rule; deleting a category with books is 409', async () => {
    const slug = `cat-${unique()}`;
    const created = await call('post', '/categories').send({
      name: 'Test Genre',
      slug,
      parentId: stableId('category', 'fiction'),
      displayOrder: 50,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug, bookCount: 0, showInSidebar: true });

    const nested = await call('post', '/categories').send({ name: 'Too Deep', slug: `deep-${unique()}`, parentId: created.body.id });
    expect(nested.status).toBe(400);

    const updated = await call('put', `/categories/${created.body.id}`).send({ name: 'Renamed', slug, showInSidebar: false });
    expect(updated.body).toMatchObject({ name: 'Renamed', showInSidebar: false, parentId: null });

    expect((await call('delete', `/categories/${created.body.id}`)).status).toBe(204);

    const inUse = await call('delete', `/categories/${stableId('category', 'self-help')}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('CATEGORY_IN_USE');
    expect((await call('delete', `/categories/${stableId('category', 'fiction')}`)).status).toBe(409);
  });
});

describe('publishers and authors', () => {
  test('publisher CRUD; publisher with books is 409', async () => {
    const slug = `pub-${unique()}`;
    const created = await call('post', '/publishers').send({ name: `Pub ${slug}`, slug, description: 'Test' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug, bookCount: 0 });
    expect((await call('put', `/publishers/${created.body.id}`).send({ name: 'Renamed Pub', slug })).body.name).toBe('Renamed Pub');
    expect((await call('delete', `/publishers/${created.body.id}`)).status).toBe(204);

    const inUse = await call('delete', `/publishers/${stableId('publisher', 'abc-publishers')}`);
    expect(inUse.status).toBe(409);
  });

  test('author CRUD; author with books is 409', async () => {
    const slug = `author-${unique()}`;
    const created = await call('post', '/authors').send({ name: 'Test Author', slug, bio: 'Writes tests.' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug, bookCount: 0, topCategory: null });
    expect((await call('put', `/authors/${created.body.id}`).send({ name: 'Renamed', slug, bio: 'x' })).body.name).toBe('Renamed');
    expect((await call('delete', `/authors/${created.body.id}`)).status).toBe(204);
    expect((await call('delete', `/authors/${stableId('author', 'daniel-reed')}`)).status).toBe(409);
  });
});

describe('coupons', () => {
  test('CRUD, duplicate code 409, percent over 100 is 400', async () => {
    const code = `ADM${unique().toUpperCase()}`;
    const input = { code, discountType: 'PERCENT', discountValue: 15, maxDiscountPaise: 10000, validUntil: '2030-01-01T00:00:00.000Z' };
    const created = await call('post', '/coupons').send(input);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code, usedCount: 0, isActive: true, minOrderValuePaise: 0 });

    const validated = await request(app).post('/api/coupons/validate').set(customer).send({ code, subtotalPaise: 50000 });
    expect(validated.body).toMatchObject({ valid: true, discountPaise: 7500 });

    expect((await call('post', '/coupons').send(input)).status).toBe(409);
    expect((await call('post', '/coupons').send({ ...input, code: `X${code}`, discountValue: 150 })).status).toBe(400);

    const updated = await call('put', `/coupons/${created.body.id}`).send({ ...input, isActive: false });
    expect(updated.body.isActive).toBe(false);
    expect((await call('delete', `/coupons/${created.body.id}`)).status).toBe(204);
  });
});

describe('stores and policies', () => {
  test('public store page shows policies', async () => {
    const res = await request(app).get('/api/stores/bookworm-main');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'BookWorm Main Store', isActive: true });
    expect(res.body.policies.map((p) => p.type).sort()).toEqual(['CANCELLATION', 'PAYMENT', 'RETURN', 'SHIPPING']);
  });

  test('store and policy CRUD; one policy per type', async () => {
    const slug = `store-${unique()}`;
    const store = await call('post', '/stores').send({ name: 'Pop-up Store', slug, description: 'Weekend pop-up' });
    expect(store.status).toBe(201);
    expect(store.body.policies).toEqual([]);

    const policy = await call('post', `/stores/${store.body.id}/policies`).send({ type: 'RETURN', title: '7-day returns', content: 'Return within 7 days.' });
    expect(policy.status).toBe(201);
    expect((await call('post', `/stores/${store.body.id}/policies`).send({ type: 'RETURN', title: 'Again', content: 'x' })).status).toBe(409);

    const updatedPolicy = await call('put', `/stores/${store.body.id}/policies/${policy.body.id}`).send({ type: 'RETURN', title: '10-day returns', content: 'y' });
    expect(updatedPolicy.body.title).toBe('10-day returns');
    expect((await call('get', `/stores/${store.body.id}/policies`)).body.items).toHaveLength(1);

    const hidden = await call('put', `/stores/${store.body.id}`).send({ name: 'Pop-up Store', slug, description: 'Closed', isActive: false });
    expect(hidden.body.isActive).toBe(false);
    expect((await request(app).get(`/api/stores/${slug}`)).status).toBe(404);

    expect((await call('delete', `/stores/${store.body.id}/policies/${policy.body.id}`)).status).toBe(204);
    expect((await call('delete', `/stores/${store.body.id}`)).status).toBe(204);
    expect((await call('get', `/stores/${randomUUID()}/policies`)).status).toBe(404);
  });
});

describe('GET /api/admin/orders', () => {
  test('lists all orders with shipments, filterable by status', async () => {
    const shopper = await createShopper({ cart: [['rain-on-tin-roofs', 1]] });
    const order = await checkoutCart(app, shopper.headers);
    await payOrder(app, shopper.headers, order.id);

    const confirmed = await call('get', '/orders?status=CONFIRMED&pageSize=48');
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.items.every((o) => o.status === 'CONFIRMED')).toBe(true);
    const mine = confirmed.body.items.find((o) => o.id === order.id);
    expect(mine.shipments[0]).toMatchObject({ type: 'FORWARD', status: 'PROCESSING' });

    const delivered = await call('get', '/orders?status=DELIVERED&pageSize=48');
    expect(delivered.body.items.map((o) => o.orderNumber)).toEqual(expect.arrayContaining(['BW-SEED000A', 'BW-SEED000B']));
    expect((await call('get', '/orders?status=NOPE')).status).toBe(400);
  });
});
