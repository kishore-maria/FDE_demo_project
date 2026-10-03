import { notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { bookSummaryInclude, serializeBookSummary } from '../catalog/catalog.serializer.js';

const itemInclude = { book: { include: bookSummaryInclude } };

const serializeItem = (item, now = new Date()) => ({
  book: serializeBookSummary(item.book, now),
  addedAt: item.createdAt,
});

/** Newest first. */
export async function getWishlist(userId) {
  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    include: itemInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  const now = new Date();
  return { items: items.map((item) => serializeItem(item, now)) };
}

/** Idempotent: adding a book that is already wishlisted returns the existing entry. */
export async function addToWishlist(userId, bookId) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } });
  if (!book) throw notFound('Book not found');

  const item = await prisma.wishlistItem.upsert({
    where: { userId_bookId: { userId, bookId } },
    create: { userId, bookId },
    update: {},
    include: itemInclude,
  });
  return serializeItem(item);
}

export async function removeFromWishlist(userId, bookId) {
  const { count } = await prisma.wishlistItem.deleteMany({ where: { userId, bookId } });
  if (count === 0) throw notFound('This book is not in your wishlist', 'NOT_IN_WISHLIST');
  return getWishlist(userId);
}
