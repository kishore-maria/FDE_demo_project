import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { bookSummaryInclude, serializeBookSummary } from './catalog.serializer.js';

const RECOMMENDATION_LIMIT = 10;
const COLLECTION_LIMIT = 12;
// Orders that represent a real purchase (paid at some point).
export const PURCHASED_STATUSES = ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED'];

const serializeAll = (books) => {
  const now = new Date();
  return books.map((book) => serializeBookSummary(book, now));
};

async function findBooksInOrder(ids) {
  const books = await prisma.book.findMany({ where: { id: { in: ids } }, include: bookSummaryInclude });
  const byId = new Map(books.map((book) => [book.id, book]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function editorsPicks() {
  const books = await prisma.book.findMany({
    where: { isEditorsPick: true },
    include: bookSummaryInclude,
    orderBy: [{ salesCount: 'desc' }, { id: 'asc' }],
    take: RECOMMENDATION_LIMIT,
  });
  return { source: 'editors_pick', items: serializeAll(books) };
}

/**
 * score = 3 × categoryAffinity + 2 × authorAffinity + ratingAvg / 5
 * categoryAffinity: share of the user's purchased quantity whose book shares a category with the candidate.
 * authorAffinity: 1 if the candidate's author is followed or was bought before.
 */
async function scoreCandidates(userId) {
  const statuses = Prisma.join(PURCHASED_STATUSES.map((status) => Prisma.sql`${status}::"OrderStatus"`));
  return prisma.$queryRaw`
    WITH purchases AS (
      SELECT oi.book_id, SUM(oi.quantity)::int AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = ${userId}::uuid AND o.status IN (${statuses})
      GROUP BY oi.book_id
    ),
    total AS (SELECT COALESCE(SUM(qty), 0)::int AS qty FROM purchases),
    known_authors AS (
      SELECT author_id FROM author_follows WHERE user_id = ${userId}::uuid
      UNION
      SELECT b.author_id FROM books b JOIN purchases p ON p.book_id = b.id
    ),
    candidates AS (
      SELECT b.id, b.author_id, b.rating_avg, b.sales_count
      FROM books b
      WHERE b.stock_quantity > 0 AND b.id NOT IN (SELECT book_id FROM purchases)
    ),
    category_overlap AS (
      SELECT c.id AS book_id, SUM(p.qty)::int AS qty
      FROM candidates c
      JOIN purchases p ON EXISTS (
        SELECT 1
        FROM book_categories mine
        JOIN book_categories theirs ON theirs.category_id = mine.category_id
        WHERE mine.book_id = c.id AND theirs.book_id = p.book_id
      )
      GROUP BY c.id
    )
    SELECT c.id::text AS id,
      (3 * COALESCE(co.qty, 0)::float / NULLIF(t.qty, 0)
        + 2 * (CASE WHEN ka.author_id IS NULL THEN 0 ELSE 1 END)
        + c.rating_avg / 5)::float AS score
    FROM candidates c
    CROSS JOIN total t
    LEFT JOIN category_overlap co ON co.book_id = c.id
    LEFT JOIN known_authors ka ON ka.author_id = c.author_id
    WHERE t.qty > 0
    ORDER BY score DESC, c.sales_count DESC, c.id
    LIMIT ${RECOMMENDATION_LIMIT}`;
}

/** GET /books/recommended — personalised for registered users with purchases, editor's picks otherwise. */
export async function getRecommendations(user) {
  if (!user || user.role === 'GUEST') return editorsPicks();

  const scored = await scoreCandidates(user.id);
  if (scored.length === 0) return editorsPicks();

  const books = await findBooksInOrder(scored.map((row) => row.id));
  return { source: 'personalised', items: serializeAll(books) };
}

export async function getBestsellers() {
  const books = await prisma.book.findMany({
    include: bookSummaryInclude,
    orderBy: [{ salesCount: 'desc' }, { id: 'asc' }],
    take: COLLECTION_LIMIT,
  });
  return { items: serializeAll(books) };
}

export async function getNewLaunches() {
  const books = await prisma.book.findMany({
    include: bookSummaryInclude,
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    take: COLLECTION_LIMIT,
  });
  return { items: serializeAll(books) };
}
