import request from 'supertest';
import { formatINR } from 'bookworm-shared';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const books = (query = '') => request(app).get(`/api/books${query}`);
const titles = (res) => res.body.items.map((b) => b.title);

describe('GET /api/categories', () => {
  test('returns Fiction and Non-Fiction with their genres and book counts', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.items.map((c) => c.name)).toEqual(['Fiction', 'Non-Fiction']);

    const sidebar = res.body.items
      .flatMap((root) => root.children)
      .filter((c) => c.showInSidebar)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    expect(sidebar).toHaveLength(19);
    expect(sidebar[0].name).toBe('Romance');
    expect(sidebar.at(-1).name).toBe('Language Learning');

    const selfHelp = sidebar.find((c) => c.slug === 'self-help');
    const expected = await prisma.bookCategory.count({ where: { category: { slug: 'self-help' } } });
    expect(selfHelp.bookCount).toBe(expected);
  });

  test('parent book counts include their child genres', async () => {
    const res = await request(app).get('/api/categories');
    const [fiction, nonFiction] = res.body.items;
    expect(fiction.bookCount + nonFiction.bookCount).toBeGreaterThanOrEqual(36);
    expect(nonFiction.children.find((c) => c.slug === 'self-help').bookCount).toBeLessThan(nonFiction.bookCount);
  });

  test('hidden sub-genres are included but flagged', async () => {
    const res = await request(app).get('/api/categories');
    const thriller = res.body.items[0].children.find((c) => c.slug === 'thriller');
    expect(thriller.showInSidebar).toBe(false);
  });
});

describe('GET /api/publishers', () => {
  test('lists the 4 publishers with book counts', async () => {
    const res = await request(app).get('/api/publishers');
    expect(res.status).toBe(200);
    expect(res.body.items.map((p) => p.name)).toEqual([
      'ABC Publishers',
      'Inkwell House',
      'Lotus Press',
      'Northwind Books',
    ]);
    const abc = res.body.items[0];
    expect(abc.bookCount).toBe(await prisma.book.count({ where: { publisher: { slug: 'abc-publishers' } } }));
  });

  test('gets one publisher; unknown id is 404, malformed id is 400', async () => {
    const abc = await prisma.publisher.findUnique({ where: { slug: 'abc-publishers' } });
    const res = await request(app).get(`/api/publishers/${abc.id}`);
    expect(res.body).toMatchObject({ name: 'ABC Publishers', slug: 'abc-publishers' });
    expect((await request(app).get('/api/publishers/2c1a0b7e-1111-4222-8333-444455556666')).status).toBe(404);
    expect((await request(app).get('/api/publishers/abc')).status).toBe(400);
  });
});

describe('GET /api/books', () => {
  test('defaults to page 1 of 12 out of 36, editor picks first', async () => {
    const res = await books();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 12, total: 36, totalPages: 3 });
    expect(res.body.items).toHaveLength(12);
    expect(titles(res).slice(0, 3)).toEqual(['The Art of Focus', 'The Path to Success', 'The Art of Learning']);
  });

  test('each book has formatted price, delivery text and primary category first', async () => {
    const res = await books('?pageSize=48');
    for (const book of res.body.items) {
      expect(book.priceInr).toBe(formatINR(book.pricePaise));
      expect(book.priceInr).toMatch(/^₹[\d,]+(\.\d{2})?$/);
      expect(book.deliveryText).toMatch(book.format === 'EBOOK' ? /^Instant download$/ : /^Delivery by \w{3}, \d{1,2} \w{3}$/);
      expect(book.categories[0].isPrimary).toBe(true);
      expect(book.inStock).toBe(true);
    }
  });

  test('category=self-help returns only self-help books', async () => {
    const res = await books('?category=self-help&pageSize=48');
    expect(res.body.total).toBe(await prisma.bookCategory.count({ where: { category: { slug: 'self-help' } } }));
    for (const book of res.body.items) expect(book.categories.map((c) => c.slug)).toContain('self-help');
  });

  test('a parent category includes books from its child genres', async () => {
    const selfHelp = await books('?category=self-help');
    const nonFiction = await books('?category=non-fiction');
    expect(nonFiction.body.total).toBeGreaterThan(selfHelp.body.total);
  });

  test('hidden sub-genres can be filtered too', async () => {
    const res = await books('?category=thriller&pageSize=48');
    expect(titles(res)).toEqual(expect.arrayContaining(['The Midnight Hour', 'The Final Frontier']));
  });

  test('unknown category returns an empty page', async () => {
    const res = await books('?category=does-not-exist');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });

  test('publisher filter ("browse the brands")', async () => {
    const res = await books('?publisher=abc-publishers&pageSize=48');
    expect(res.body.total).toBeGreaterThan(0);
    for (const book of res.body.items) expect(book.publisher.slug).toBe('abc-publishers');
  });

  test('author filter', async () => {
    const res = await books('?author=daniel-reed&pageSize=48');
    expect(res.body.total).toBe(4);
    for (const book of res.body.items) expect(book.author.name).toBe('Daniel Reed');
  });

  test('format filter', async () => {
    const res = await books('?format=EBOOK&pageSize=48');
    expect(res.body.total).toBeGreaterThan(0);
    for (const book of res.body.items) expect(book.format).toBe('EBOOK');
  });

  test('language filter is case-insensitive', async () => {
    const res = await books('?language=hindi&pageSize=48');
    expect(res.body.total).toBe(2);
    for (const book of res.body.items) expect(book.language).toBe('Hindi');
  });

  test('price range is inclusive and in paise', async () => {
    const res = await books('?minPrice=30000&maxPrice=40000&pageSize=48');
    expect(res.body.total).toBeGreaterThan(0);
    for (const book of res.body.items) {
      expect(book.pricePaise).toBeGreaterThanOrEqual(30000);
      expect(book.pricePaise).toBeLessThanOrEqual(40000);
    }
  });

  test('minPrice greater than maxPrice returns 400', async () => {
    const res = await books('?minPrice=50000&maxPrice=10000');
    expect(res.status).toBe(400);
  });

  test('search matches title (case-insensitive)', async () => {
    const res = await books('?search=MINIMALISM');
    expect(titles(res)).toEqual(['Joy of Minimalism', "Joy of Minimalism (Collector's Hardcover)"]);
  });

  test('search matches author and publisher names', async () => {
    const byAuthor = await books('?search=mitchell&pageSize=48');
    for (const book of byAuthor.body.items) expect(book.author.name).toBe('Laura Mitchell');
    expect(byAuthor.body.total).toBe(4);

    const byPublisher = await books('?search=northwind&pageSize=48');
    for (const book of byPublisher.body.items) expect(book.publisher.name).toBe('Northwind Books');
  });

  test('relevance ranks title matches before author/publisher matches', async () => {
    // "house" is in one title and in the "Inkwell House" publisher name.
    const res = await books('?search=house&pageSize=48');
    expect(res.body.items[0].title).toBe('The Vanishing House');
    expect(res.body.total).toBeGreaterThan(1);
  });

  test.each([
    ['price_asc', (a, b) => a.pricePaise <= b.pricePaise],
    ['price_desc', (a, b) => a.pricePaise >= b.pricePaise],
    ['rating', (a, b) => a.ratingAvg >= b.ratingAvg],
  ])('sort=%s orders the whole result', async (sort, inOrder) => {
    const res = await books(`?sort=${sort}&pageSize=48`);
    const items = res.body.items;
    for (let i = 1; i < items.length; i += 1) expect(inOrder(items[i - 1], items[i])).toBe(true);
  });

  test('sort=newest puts the design new launches first', async () => {
    const res = await books('?sort=newest');
    expect(titles(res).slice(0, 3)).toEqual(['Joy of Minimalism', 'The Vanishing House', 'The Lost Kitten']);
  });

  test('pagination returns distinct pages with correct totals', async () => {
    const page1 = await books('?page=1&pageSize=5');
    const page2 = await books('?page=2&pageSize=5');
    expect(page2.body).toMatchObject({ page: 2, pageSize: 5, total: 36, totalPages: 8 });
    expect(page2.body.items).toHaveLength(5);
    const overlap = titles(page1).filter((t) => titles(page2).includes(t));
    expect(overlap).toEqual([]);
  });

  test('a page past the end is empty', async () => {
    const res = await books('?page=10');
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(36);
  });

  test('filters combine', async () => {
    const res = await books('?category=mystery&format=PAPERBACK&sort=price_asc&pageSize=48');
    expect(res.body.total).toBeGreaterThan(0);
    for (const book of res.body.items) {
      expect(book.format).toBe('PAPERBACK');
      expect(book.categories.map((c) => c.slug)).toContain('mystery');
    }
  });

  test.each([
    ['pageSize above 48', '?pageSize=49'],
    ['page 0', '?page=0'],
    ['unknown sort', '?sort=popular'],
    ['unknown format', '?format=AUDIOBOOK'],
    ['negative price', '?minPrice=-1'],
    ['bad slug', '?category=Self%20Help'],
  ])('%s returns 400', async (_label, query) => {
    const res = await books(query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
