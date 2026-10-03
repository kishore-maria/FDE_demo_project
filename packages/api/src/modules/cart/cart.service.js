import { formatINR } from 'bookworm-shared';
import { assertOrderAccess } from '../../lib/access.js';
import { conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { bookSummaryInclude, serializeBookSummary } from '../catalog/catalog.serializer.js';

async function loadCart(userId, db = prisma) {
  const items = await db.cartItem.findMany({
    where: { userId },
    include: { book: { include: bookSummaryInclude } },
    orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
  });

  const now = new Date();
  let itemCount = 0;
  let subtotalPaise = 0;
  const lines = items.map(({ book, quantity }) => {
    const lineTotalPaise = book.pricePaise * quantity;
    itemCount += quantity;
    subtotalPaise += lineTotalPaise;
    return {
      book: serializeBookSummary(book, now),
      quantity,
      lineTotalPaise,
      lineTotalInr: formatINR(lineTotalPaise),
    };
  });

  return { items: lines, itemCount, subtotalPaise, subtotalInr: formatINR(subtotalPaise) };
}

async function findBook(bookId) {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, title: true, stockQuantity: true },
  });
  if (!book) throw notFound('Book not found');
  return book;
}

function insufficientStock(book, requested) {
  return conflict(`Only ${book.stockQuantity} copies of "${book.title}" are available`, 'INSUFFICIENT_STOCK', {
    bookId: book.id,
    available: book.stockQuantity,
    requested,
  });
}

/**
 * Adds quantities to the cart without failing the whole batch: lines are summed with what is
 * already in the cart and capped at stock. Returns the skipped/capped lines.
 */
async function addLines(userId, lines) {
  const wanted = new Map();
  for (const { bookId, quantity } of lines) wanted.set(bookId, (wanted.get(bookId) ?? 0) + quantity);
  const bookIds = [...wanted.keys()];

  const [books, existing] = await Promise.all([
    prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true, title: true, stockQuantity: true } }),
    prisma.cartItem.findMany({ where: { userId, bookId: { in: bookIds } } }),
  ]);
  const bookById = new Map(books.map((book) => [book.id, book]));
  const inCart = new Map(existing.map((item) => [item.bookId, item.quantity]));

  const skipped = [];
  const writes = [];
  for (const [bookId, quantity] of wanted) {
    const book = bookById.get(bookId);
    if (!book) {
      skipped.push({ bookId, reason: 'NOT_FOUND' });
      continue;
    }
    if (book.stockQuantity === 0) {
      skipped.push({ bookId, title: book.title, reason: 'OUT_OF_STOCK' });
      continue;
    }
    const current = inCart.get(bookId) ?? 0;
    const target = Math.min(current + quantity, book.stockQuantity);
    if (target < current + quantity) skipped.push({ bookId, title: book.title, reason: 'QUANTITY_CAPPED' });
    if (target === current) continue;
    writes.push(
      prisma.cartItem.upsert({
        where: { userId_bookId: { userId, bookId } },
        create: { userId, bookId, quantity: target },
        update: { quantity: target },
      }),
    );
  }

  if (writes.length) await prisma.$transaction(writes);
  return skipped;
}

export const getCart = (userId) => loadCart(userId);

export async function addItem(userId, { bookId, quantity = 1 }) {
  const book = await findBook(bookId);
  const existing = await prisma.cartItem.findUnique({ where: { userId_bookId: { userId, bookId } } });
  const target = (existing?.quantity ?? 0) + quantity;
  if (target > book.stockQuantity) throw insufficientStock(book, target);

  await prisma.cartItem.upsert({
    where: { userId_bookId: { userId, bookId } },
    create: { userId, bookId, quantity: target },
    update: { quantity: target },
  });
  return loadCart(userId);
}

export async function updateItem(userId, bookId, quantity) {
  const book = await findBook(bookId);
  if (quantity === 0) {
    await prisma.cartItem.deleteMany({ where: { userId, bookId } });
    return loadCart(userId);
  }
  if (quantity > book.stockQuantity) throw insufficientStock(book, quantity);

  await prisma.cartItem.upsert({
    where: { userId_bookId: { userId, bookId } },
    create: { userId, bookId, quantity },
    update: { quantity },
  });
  return loadCart(userId);
}

export async function removeItem(userId, bookId) {
  const { count } = await prisma.cartItem.deleteMany({ where: { userId, bookId } });
  if (count === 0) throw notFound('This book is not in your cart', 'NOT_IN_CART');
  return loadCart(userId);
}

export async function clearCart(userId) {
  await prisma.cartItem.deleteMany({ where: { userId } });
  return loadCart(userId);
}

/** POST /cart/merge — browser cart → server cart after login, register or guest-session. */
export async function mergeCart(userId, items) {
  const skipped = await addLines(userId, items);
  return { ...(await loadCart(userId)), skipped };
}

/** POST /cart/buy-again/:orderId — re-add a past order's books, skipping what can't be bought. */
export async function buyAgain(user, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true, guestSessionId: true, items: { select: { bookId: true, quantity: true } } },
  });
  assertOrderAccess(user, order);

  const skipped = await addLines(user.id, order.items);
  return { ...(await loadCart(user.id)), skipped };
}
