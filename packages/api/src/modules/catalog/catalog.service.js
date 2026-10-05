import { badRequest, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  bookSummaryInclude,
  roundRating,
  serializeBookSummary,
  serializeCategory,
  serializePublisher,
  serializeReview,
} from './catalog.serializer.js';

export const DEFAULT_PAGE_SIZE = 12;
const RELATED_BOOKS_LIMIT = 5;
const REVIEWS_LIMIT = 20;

// id is the final tie-breaker so pagination is stable.
const ORDER_BY = {
  relevance: [{ isEditorsPick: 'desc' }, { salesCount: 'desc' }, { title: 'asc' }, { id: 'asc' }],
  price_asc: [{ pricePaise: 'asc' }, { title: 'asc' }, { id: 'asc' }],
  price_desc: [{ pricePaise: 'desc' }, { title: 'asc' }, { id: 'asc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
  newest: [{ publishedAt: 'desc' }, { id: 'asc' }],
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const contains = (value) => ({ contains: value, mode: 'insensitive' });

/** A category filter matches the category itself plus its child genres. */
async function categoryIdsForSlug(slug) {
  const category = await prisma.category.findUnique({
    where: { slug },
    include: { children: { select: { id: true } } },
  });
  return category ? [category.id, ...category.children.map((child) => child.id)] : null;
}

/** Returns a Prisma where clause, or null when a filter references something that doesn't exist. */
async function buildBookWhere(query) {
  const where = {};

  if (query.category) {
    const categoryIds = await categoryIdsForSlug(query.category);
    if (!categoryIds) return null;
    where.categories = { some: { categoryId: { in: categoryIds } } };
  }
  if (query.publisher) where.publisher = { slug: query.publisher };
  if (query.author) where.author = { slug: query.author };
  if (query.format) where.format = query.format;
  if (query.language) where.language = { equals: query.language, mode: 'insensitive' };

  const minPrice = toInt(query.minPrice, undefined);
  const maxPrice = toInt(query.maxPrice, undefined);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw badRequest('minPrice cannot be greater than maxPrice', undefined, 'VALIDATION_ERROR');
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.pricePaise = { gte: minPrice, lte: maxPrice };
  }

  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { title: contains(search) },
      { author: { name: contains(search) } },
      { publisher: { name: contains(search) } },
    ];
  }
  return where;
}

/** Relevance with a search term: title matches first, then best sellers. */
async function findSearchRankedPage(where, search, skip, take) {
  const term = search.toLowerCase();
  const candidates = await prisma.book.findMany({
    where,
    select: { id: true, title: true, salesCount: true },
  });
  const titleMatch = (book) => Number(book.title.toLowerCase().includes(term));
  candidates.sort(
    (a, b) => titleMatch(b) - titleMatch(a) || b.salesCount - a.salesCount || a.id.localeCompare(b.id),
  );

  const ids = candidates.slice(skip, skip + take).map((book) => book.id);
  const books = await prisma.book.findMany({ where: { id: { in: ids } }, include: bookSummaryInclude });
  const byId = new Map(books.map((book) => [book.id, book]));
  return ids.map((id) => byId.get(id));
}

/** GET /books — filter, search, sort and paginate the catalog. */
export async function listBooks(query) {
  const page = toInt(query.page, 1);
  const pageSize = toInt(query.pageSize, DEFAULT_PAGE_SIZE);
  const sort = query.sort ?? 'relevance';
  const skip = (page - 1) * pageSize;
  const empty = { items: [], page, pageSize, total: 0, totalPages: 0 };

  const where = await buildBookWhere(query);
  if (!where) return empty;

  const total = await prisma.book.count({ where });
  if (total === 0) return empty;

  const search = query.search?.trim();
  const books =
    sort === 'relevance' && search
      ? await findSearchRankedPage(where, search, skip, pageSize)
      : await prisma.book.findMany({
          where,
          include: bookSummaryInclude,
          orderBy: ORDER_BY[sort],
          skip,
          take: pageSize,
        });

  const now = new Date();
  return {
    items: books.map((book) => serializeBookSummary(book, now)),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** Fiction / Non-Fiction with their child genres, each with a book count. */
export async function listCategoryTree() {
  const categories = await prisma.category.findMany({
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { books: true } } },
  });

  const roots = categories.filter((category) => !category.parentId);
  return Promise.all(
    roots.map(async (root) => {
      const children = categories.filter((category) => category.parentId === root.id);
      const familyIds = [root.id, ...children.map((child) => child.id)];
      const bookCount = await prisma.book.count({
        where: { categories: { some: { categoryId: { in: familyIds } } } },
      });
      return {
        ...serializeCategory(root, bookCount),
        children: children.map((child) => serializeCategory(child, child._count.books)),
      };
    }),
  );
}

export async function listPublishers() {
  const publishers = await prisma.publisher.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { books: true } } },
  });
  return publishers.map(serializePublisher);
}

export async function getPublisher(publisherId) {
  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    include: { _count: { select: { books: true } } },
  });
  if (!publisher) throw notFound('Publisher not found');
  return serializePublisher(publisher);
}

const reviewerInclude = { user: { select: { firstName: true } } };

const bookDetailInclude = {
  ...bookSummaryInclude,
  author: { include: { _count: { select: { books: true } } } },
  categories: {
    include: {
      category: { select: { id: true, name: true, slug: true, parent: { select: { id: true, name: true, slug: true } } } },
    },
  },
  reviews: { include: reviewerInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: REVIEWS_LIMIT },
  relationsFrom: {
    include: { relatedBook: { include: bookSummaryInclude } },
    orderBy: { relatedBook: { title: 'asc' } },
  },
};

async function personalFlags(user, book) {
  if (!user) return { isWishlisted: null, isFollowingAuthor: null };
  const [wishlisted, following] = await Promise.all([
    prisma.wishlistItem.findUnique({ where: { userId_bookId: { userId: user.id, bookId: book.id } } }),
    prisma.authorFollow.findUnique({ where: { userId_authorId: { userId: user.id, authorId: book.authorId } } }),
  ]);
  return { isWishlisted: Boolean(wishlisted), isFollowingAuthor: Boolean(following) };
}

/** GET /books/:id — full product page payload. */
export async function getBookDetail(bookId, user) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, include: bookDetailInclude });
  if (!book) throw notFound('Book not found');

  const primary = (book.categories.find((link) => link.isPrimary) ?? book.categories[0])?.category;
  const [relatedBooks, flags] = await Promise.all([
    primary
      ? prisma.book.findMany({
          where: { id: { not: book.id }, categories: { some: { categoryId: primary.id } } },
          include: bookSummaryInclude,
          orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }],
          take: RELATED_BOOKS_LIMIT,
        })
      : [],
    personalFlags(user, book),
  ]);

  const now = new Date();
  const relatedOfType = (type) =>
    book.relationsFrom
      .filter((relation) => relation.type === type)
      .map((relation) => serializeBookSummary(relation.relatedBook, now));
  const toRef = ({ id, name, slug }) => ({ id, name, slug });

  return {
    ...serializeBookSummary(book, now),
    description: book.description,
    isbn: book.isbn ?? null,
    backCoverImageUrl: book.backCoverImageUrl ?? null,
    publishedAt: book.publishedAt,
    stockQuantity: book.stockQuantity,
    isEditorsPick: book.isEditorsPick,
    author: {
      id: book.author.id,
      name: book.author.name,
      slug: book.author.slug,
      photoUrl: book.author.photoUrl ?? null,
      bio: book.author.bio,
      bookCount: book.author._count.books,
    },
    breadcrumb: primary ? [primary.parent, primary].filter(Boolean).map(toRef) : [],
    reviews: book.reviews.map(serializeReview),
    relatedBooks: relatedBooks.map((related) => serializeBookSummary(related, now)),
    upsell: relatedOfType('UPSELL'),
    crossSell: relatedOfType('CROSS_SELL'),
    ...flags,
  };
}

/**
 * POST /books/:id/reviews — one review per user per book.
 * Seeded books carry a rating baseline without review rows, so the aggregate is
 * adjusted incrementally under a row lock instead of recomputed from the reviews table.
 */
export async function upsertReview(userId, bookId, { rating, comment }) {
  return prisma.$transaction(async (tx) => {
    const [book] = await tx.$queryRaw`
      SELECT rating_avg AS "ratingAvg", rating_count AS "ratingCount"
      FROM books WHERE id = ${bookId}::uuid FOR UPDATE`;
    if (!book) throw notFound('Book not found');

    const key = { bookId_userId: { bookId, userId } };
    const existing = await tx.review.findUnique({ where: key, select: { rating: true } });
    const data = { rating, comment: comment?.trim() || null };
    const review = await tx.review.upsert({
      where: key,
      create: { bookId, userId, ...data },
      update: data,
      include: reviewerInclude,
    });

    const ratingCount = book.ratingCount + (existing ? 0 : 1);
    const ratingSum = book.ratingAvg * book.ratingCount - (existing?.rating ?? 0) + rating;
    const ratingAvg = Math.min(5, Math.max(0, ratingSum / ratingCount));
    await tx.book.update({ where: { id: bookId }, data: { ratingAvg, ratingCount } });

    return { review: serializeReview(review), ratingAvg: roundRating(ratingAvg), ratingCount };
  });
}
