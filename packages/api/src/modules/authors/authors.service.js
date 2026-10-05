import { conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { bookSummaryInclude, serializeBookSummary } from '../catalog/catalog.serializer.js';
import { PURCHASED_STATUSES } from '../catalog/recommendation.service.js';

const NEW_RELEASES_LIMIT = 12;
const SUGGESTIONS_LIMIT = 10;

export const authorCardInclude = {
  _count: { select: { books: true } },
  books: {
    select: {
      categories: { select: { isPrimary: true, category: { select: { id: true, name: true, slug: true } } } },
    },
  },
};

/** The primary category that most of the author's books belong to. */
function topCategory(books) {
  const counts = new Map();
  for (const book of books) {
    for (const { isPrimary, category } of book.categories) {
      if (!isPrimary) continue;
      const entry = counts.get(category.id) ?? { category, count: 0 };
      entry.count += 1;
      counts.set(category.id, entry);
    }
  }
  const [top] = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.category.name.localeCompare(b.category.name),
  );
  return top ? { id: top.category.id, name: top.category.name, slug: top.category.slug } : null;
}

/** `followedIds` is undefined for anonymous requests, which omits isFollowing. */
export function serializeAuthor(author, followedIds) {
  return {
    id: author.id,
    name: author.name,
    slug: author.slug,
    photoUrl: author.photoUrl ?? null,
    bio: author.bio,
    bookCount: author._count.books,
    topCategory: topCategory(author.books),
    ...(followedIds && { isFollowing: followedIds.has(author.id) }),
  };
}

async function followedAuthorIds(user) {
  if (!user) return undefined;
  const follows = await prisma.authorFollow.findMany({ where: { userId: user.id }, select: { authorId: true } });
  return new Set(follows.map((follow) => follow.authorId));
}

async function assertAuthorExists(authorId) {
  const author = await prisma.author.findUnique({ where: { id: authorId }, select: { id: true } });
  if (!author) throw notFound('Author not found');
}

/** GET /authors — every author; `isFollowing` is set when `user` is signed in. */
export async function listAuthors(user) {
  const [authors, followedIds] = await Promise.all([
    prisma.author.findMany({ include: authorCardInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    followedAuthorIds(user),
  ]);
  return { items: authors.map((author) => serializeAuthor(author, followedIds)) };
}

/** GET /authors/:id — profile plus all their books, newest first. */
export async function getAuthor(authorId, user) {
  const [author, followedIds] = await Promise.all([
    prisma.author.findUnique({
      where: { id: authorId },
      include: {
        _count: { select: { books: true } },
        books: { include: bookSummaryInclude, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }] },
      },
    }),
    followedAuthorIds(user),
  ]);
  if (!author) throw notFound('Author not found');

  const now = new Date();
  return {
    ...serializeAuthor(author, followedIds),
    books: author.books.map((book) => serializeBookSummary(book, now)),
  };
}

/** My Writers → Your Writers, most recently followed first. */
export async function listFollowing(userId) {
  const follows = await prisma.authorFollow.findMany({
    where: { userId },
    include: { author: { include: authorCardInclude } },
    orderBy: [{ followedAt: 'desc' }, { id: 'asc' }],
  });
  const followedIds = new Set(follows.map((follow) => follow.authorId));
  return { items: follows.map((follow) => serializeAuthor(follow.author, followedIds)) };
}

/** My Writers → New from Your Writers. */
export async function listNewReleases(userId) {
  const books = await prisma.book.findMany({
    where: { author: { followers: { some: { userId } } } },
    include: bookSummaryInclude,
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    take: NEW_RELEASES_LIMIT,
  });
  const now = new Date();
  return { items: books.map((book) => serializeBookSummary(book, now)) };
}

/** My Writers → Discover Writers: authors in categories I bought from that I don't follow yet. */
export async function listSuggestions(userId) {
  const purchasedLinks = await prisma.bookCategory.findMany({
    where: { book: { orderItems: { some: { order: { userId, status: { in: PURCHASED_STATUSES } } } } } },
    select: { categoryId: true },
    distinct: ['categoryId'],
  });
  if (purchasedLinks.length === 0) return { items: [] };

  const categoryIds = new Set(purchasedLinks.map((link) => link.categoryId));
  const authors = await prisma.author.findMany({
    where: {
      followers: { none: { userId } },
      books: { some: { categories: { some: { categoryId: { in: [...categoryIds] } } } } },
    },
    include: authorCardInclude,
  });

  const matchingBooks = (author) =>
    author.books.filter((book) => book.categories.some(({ category }) => categoryIds.has(category.id))).length;
  const ranked = authors
    .map((author) => ({ author, matches: matchingBooks(author) }))
    .sort((a, b) => b.matches - a.matches || a.author.name.localeCompare(b.author.name))
    .slice(0, SUGGESTIONS_LIMIT);

  const notFollowed = new Set();
  return { items: ranked.map(({ author }) => serializeAuthor(author, notFollowed)) };
}

/** POST /authors/:id/follow — 409 ALREADY_FOLLOWING when already followed. */
export async function followAuthor(userId, authorId) {
  await assertAuthorExists(authorId);
  const key = { userId_authorId: { userId, authorId } };
  if (await prisma.authorFollow.findUnique({ where: key })) {
    throw conflict('You already follow this author', 'ALREADY_FOLLOWING');
  }
  await prisma.authorFollow.create({ data: { userId, authorId, source: 'MANUAL' } });
  return { authorId, isFollowing: true };
}

/** DELETE /authors/:id/follow — 404 NOT_FOLLOWING when not followed. */
export async function unfollowAuthor(userId, authorId) {
  await assertAuthorExists(authorId);
  const { count } = await prisma.authorFollow.deleteMany({ where: { userId, authorId } });
  if (count === 0) throw notFound('You do not follow this author', 'NOT_FOLLOWING');
  return { authorId, isFollowing: false };
}
