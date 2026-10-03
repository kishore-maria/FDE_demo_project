import { afterAll, describe, expect, test } from 'vitest';
import { prisma } from '../src/lib/prisma.js';

const MODELS = [
  'user',
  'address',
  'store',
  'storePolicy',
  'category',
  'bookCategory',
  'publisher',
  'author',
  'authorFollow',
  'book',
  'bookRelation',
  'review',
  'wishlistItem',
  'cartItem',
  'coupon',
  'order',
  'orderItem',
  'payment',
  'shipment',
  'shipmentEvent',
  'giftPointTransaction',
];

async function column(table, name) {
  const [row] = await prisma.$queryRaw`
    SELECT is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${name}`;
  return row;
}

describe('schema smoke test', () => {
  afterAll(() => prisma.$disconnect());

  test('connects to the test database', async () => {
    const [{ db }] = await prisma.$queryRaw`SELECT current_database() AS db`;
    expect(db).toBe('bookworm_test');
  });

  test('has all 21 application tables', async () => {
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`;
    expect(tables).toHaveLength(21);
  });

  test.each(MODELS)('model %s is queryable', async (model) => {
    expect(typeof (await prisma[model].count())).toBe('number');
  });

  test('orders.user_id is NOT NULL', async () => {
    expect((await column('orders', 'user_id')).is_nullable).toBe('NO');
  });

  test('books.stock_quantity defaults to 100', async () => {
    expect((await column('books', 'stock_quantity')).column_default).toBe('100');
  });

  test('users.password_hash is nullable for guests', async () => {
    expect((await column('users', 'password_hash')).is_nullable).toBe('YES');
  });

  test('CHECK constraint blocks negative stock', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO books (id, slug, title, author_id, publisher_id, short_description,
        description, price_paise, format, cover_image_url, stock_quantity, published_at, updated_at)
        VALUES (gen_random_uuid(), 'neg-stock', 'x', gen_random_uuid(), gen_random_uuid(), 'x', 'x',
        100, 'PAPERBACK', 'x', -1, now(), now())`,
    ).rejects.toThrow(/books_stock_check/);
  });
});
