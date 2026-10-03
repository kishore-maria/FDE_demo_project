import { afterAll, describe, expect, test } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { seedCatalog } from '../prisma/seed/catalog.js';
import { sidebarGenres } from '../prisma/seed/data/categories.js';

const DESIGN_BOOKS = [
  ['The Art of Focus', 'Arjun Patel', 39900, 'PAPERBACK'],
  ['The Art of Learning', 'Raj Patel', 25900, 'PAPERBACK'],
  ['The Path to Success', 'James Wright', 35900, 'PAPERBACK'],
  ['The Midnight Hour', 'James Adams', 29900, 'PAPERBACK'],
  ['Beneath the Stars', 'Jessica Martin', 49900, 'HARDCOVER'],
  ['The Final Frontier', 'Laura Mitchell', 35900, 'PAPERBACK'],
  ['Joy of Minimalism', 'Daniel Reed', 14900, 'PAPERBACK'],
  ['The Vanishing House', 'Clara Nelson', 9900, 'EBOOK'],
  ['The Lost Kitten', 'Emily Parker', 33900, 'HARDCOVER'],
];

async function catalogCounts() {
  const [categories, books, authors, publishers, bookCategories, relations, policies] =
    await Promise.all([
      prisma.category.count(),
      prisma.book.count(),
      prisma.author.count(),
      prisma.publisher.count(),
      prisma.bookCategory.count(),
      prisma.bookRelation.count(),
      prisma.storePolicy.count(),
    ]);
  return { categories, books, authors, publishers, bookCategories, relations, policies };
}

describe('catalog seed', () => {
  afterAll(() => prisma.$disconnect());

  test('has 19 sidebar genres in design order and no "All" row', async () => {
    const sidebar = await prisma.category.findMany({
      where: { showInSidebar: true },
      orderBy: { displayOrder: 'asc' },
    });
    expect(sidebar.map((c) => c.name)).toEqual(sidebarGenres.map((g) => g.name));
    expect(await prisma.category.findFirst({ where: { name: 'All' } })).toBeNull();
  });

  test('every sidebar genre has a parent and at least one book', async () => {
    const sidebar = await prisma.category.findMany({
      where: { showInSidebar: true },
      include: { parent: true, _count: { select: { books: true } } },
    });
    for (const genre of sidebar) {
      expect(['Fiction', 'Non-Fiction']).toContain(genre.parent?.name);
      expect(genre._count.books, genre.name).toBeGreaterThan(0);
    }
  });

  test('has 36 books, 12 authors and 4 publishers', async () => {
    const counts = await catalogCounts();
    expect(counts).toMatchObject({ books: 36, authors: 12, publishers: 4, categories: 24 });
  });

  test('every book has exactly one primary category, and it is a sidebar genre', async () => {
    const books = await prisma.book.findMany({ include: { categories: { include: { category: true } } } });
    for (const book of books) {
      const primaries = book.categories.filter((c) => c.isPrimary);
      expect(primaries, book.title).toHaveLength(1);
      expect(primaries[0].category.showInSidebar, book.title).toBe(true);
    }
  });

  test.each(DESIGN_BOOKS)('design book "%s" matches the UI', async (title, author, price, format) => {
    const book = await prisma.book.findFirst({ where: { title }, include: { author: true } });
    expect(book).toMatchObject({ pricePaise: price, format });
    expect(book.author.name).toBe(author);
  });

  test('Joy of Minimalism is published by ABC Publishers with 145 copies sold', async () => {
    const book = await prisma.book.findUnique({
      where: { slug: 'joy-of-minimalism' },
      include: { publisher: true },
    });
    expect(book.publisher.name).toBe('ABC Publishers');
    expect(book.salesCount).toBe(145);
  });

  test('all books have stock 100 and front/back picsum covers', async () => {
    const books = await prisma.book.findMany();
    for (const book of books) {
      expect(book.stockQuantity).toBe(100);
      expect(book.coverImageUrl).toMatch(/^https:\/\/picsum\.photos\/seed\/.+-front\//);
      expect(book.backCoverImageUrl).toMatch(/-back\//);
    }
  });

  test('has at least 4 non-English books', async () => {
    expect(await prisma.book.count({ where: { language: { not: 'English' } } })).toBeGreaterThanOrEqual(4);
  });

  test('home page sections match the design', async () => {
    const top3 = async (orderBy, where = {}) =>
      (await prisma.book.findMany({ where, orderBy, take: 3 })).map((b) => b.title);

    expect(await top3({ salesCount: 'desc' })).toEqual([
      'The Midnight Hour',
      'Beneath the Stars',
      'The Final Frontier',
    ]);
    expect(await top3({ publishedAt: 'desc' })).toEqual([
      'Joy of Minimalism',
      'The Vanishing House',
      'The Lost Kitten',
    ]);
    expect(await top3({ title: 'asc' }, { isEditorsPick: true })).toEqual([
      'The Art of Focus',
      'The Art of Learning',
      'The Path to Success',
    ]);
  });

  test('store has 4 policies and book relations exist', async () => {
    const store = await prisma.store.findUnique({
      where: { slug: 'bookworm-main' },
      include: { policies: true },
    });
    expect(store.policies).toHaveLength(4);
    const joy = await prisma.book.findUnique({
      where: { slug: 'joy-of-minimalism' },
      include: { relationsFrom: { include: { relatedBook: true } } },
    });
    expect(joy.relationsFrom.map((r) => `${r.type}:${r.relatedBook.slug}`)).toEqual(
      expect.arrayContaining(['CROSS_SELL:the-focus-reset', 'UPSELL:joy-of-minimalism-hardcover']),
    );
  });

  test('re-running the catalog seed does not duplicate data', async () => {
    const before = await catalogCounts();
    await seedCatalog(prisma);
    expect(await catalogCounts()).toEqual(before);
  });
});
