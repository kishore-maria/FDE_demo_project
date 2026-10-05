import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authHeader, createUser, loginAs, tokenFor } from './factories.js';

const app = createApp();
const bookId = (slug) => stableId('book', slug);
const getBook = (slug, headers = {}) => request(app).get(`/api/books/${bookId(slug)}`).set(headers);
const postReview = (slug, body, headers = {}) =>
  request(app).post(`/api/books/${bookId(slug)}/reviews`).set(headers).send(body);

async function registeredHeader() {
  const { user } = await createUser();
  return { user, headers: authHeader(tokenFor(user)) };
}

describe('GET /api/books/:bookId', () => {
  test('returns the full Joy of Minimalism product page', async () => {
    const res = await getBook('joy-of-minimalism');
    expect(res.status).toBe(200);
    const book = res.body;

    expect(book).toMatchObject({
      title: 'Joy of Minimalism',
      priceInr: '₹149',
      format: 'PAPERBACK',
      language: 'English',
      salesCount: 145,
      ratingAvg: 4.8,
      ratingCount: 36,
      publisher: { name: 'ABC Publishers', slug: 'abc-publishers' },
      isWishlisted: null,
      isFollowingAuthor: null,
    });
    expect(book.description.length).toBeGreaterThan(book.shortDescription.length);
    expect(book.deliveryText).toBe('Usually delivered in 1–8 business days');
    expect(book.backCoverImageUrl).toContain('joy-of-minimalism-back');
    expect(book.author).toMatchObject({ name: 'Daniel Reed', slug: 'daniel-reed', bookCount: 4 });
    expect(book.author.bio).toBeTruthy();
    expect(book.author.photoUrl).toBeTruthy();
    expect(book.breadcrumb.map((c) => c.name)).toEqual(['Non-Fiction', 'Self-help']);
  });

  test('cross-sell and up-sell come from book relations', async () => {
    const { body } = await getBook('joy-of-minimalism');
    expect(body.crossSell.map((b) => b.title)).toEqual(['Less, But Better', 'The Focus Reset']);
    expect(body.upsell.map((b) => b.slug)).toEqual(['joy-of-minimalism-hardcover']);
  });

  test('related reads: same primary category, excludes self, top 5 by rating', async () => {
    const { body } = await getBook('joy-of-minimalism');
    expect(body.relatedBooks).toHaveLength(5);
    expect(body.relatedBooks.map((b) => b.id)).not.toContain(body.id);
    for (const related of body.relatedBooks) {
      expect(related.categories.map((c) => c.slug)).toContain('self-help');
    }
    const ratings = body.relatedBooks.map((b) => b.ratingAvg);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  test('reviews show the reviewer first name only', async () => {
    const { body } = await getBook('joy-of-minimalism');
    expect(body.reviews[0]).toMatchObject({
      rating: 5,
      comment: 'A calm, practical guide. Loved it!',
      reviewer: { firstName: 'Priya' },
    });
    expect(Object.keys(body.reviews[0].reviewer)).toEqual(['firstName']);
  });

  test('eBooks show instant download and a Fiction breadcrumb for fiction genres', async () => {
    const { body } = await getBook('the-vanishing-house');
    expect(body.deliveryText).toBe('Instant download');
    expect(body.breadcrumb[0].name).toBe('Fiction');
    expect(body.breadcrumb).toHaveLength(2);
  });

  test('authenticated customer gets wishlist and follow flags', async () => {
    const token = await loginAs(app, 'customer@test.com');
    const { body } = await getBook('joy-of-minimalism', authHeader(token));
    expect(body).toMatchObject({ isWishlisted: false, isFollowingAuthor: true });

    const other = await getBook('the-art-of-focus', authHeader(token));
    expect(other.body.isFollowingAuthor).toBe(false);
  });

  test('wishlisted book is flagged', async () => {
    const { user, headers } = await registeredHeader();
    await prisma.wishlistItem.create({ data: { userId: user.id, bookId: bookId('the-art-of-focus') } });
    const { body } = await getBook('the-art-of-focus', headers);
    expect(body.isWishlisted).toBe(true);
  });

  test('guest gets false flags', async () => {
    const { user } = await createUser({ role: 'GUEST' });
    const { body } = await getBook('joy-of-minimalism', authHeader(tokenFor(user, { gsid: randomUUID() })));
    expect(body).toMatchObject({ isWishlisted: false, isFollowingAuthor: false });
  });

  test('malformed id is 400, unknown id is 404', async () => {
    const bad = await request(app).get('/api/books/not-a-uuid');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const missing = await request(app).get(`/api/books/${randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/books/:bookId/reviews', () => {
  // Joy of Minimalism hardcover is seeded at 4.9 from 8 ratings.
  const slug = 'joy-of-minimalism-hardcover';

  test('requires a token', async () => {
    const res = await postReview(slug, { rating: 5 });
    expect(res.status).toBe(401);
  });

  test('guests cannot review', async () => {
    const { user } = await createUser({ role: 'GUEST' });
    const res = await postReview(slug, { rating: 5 }, authHeader(tokenFor(user, { gsid: randomUUID() })));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test.each([
    ['rating 6', { rating: 6 }],
    ['rating 0', { rating: 0 }],
    ['fractional rating', { rating: 4.5 }],
    ['missing rating', { comment: 'Nice' }],
    ['comment of 101 chars', { rating: 4, comment: 'x'.repeat(101) }],
    ['unknown field', { rating: 4, userId: randomUUID() }],
  ])('%s is rejected with 400', async (_label, body) => {
    const { headers } = await registeredHeader();
    const res = await postReview(slug, body, headers);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('unknown book is 404', async () => {
    const { headers } = await registeredHeader();
    const res = await request(app).post(`/api/books/${randomUUID()}/reviews`).set(headers).send({ rating: 4 });
    expect(res.status).toBe(404);
  });

  test('creates then replaces my review and adjusts the rating incrementally', async () => {
    const { headers } = await registeredHeader();
    const before = await prisma.book.findUnique({ where: { id: bookId(slug) } });

    const created = await postReview(slug, { rating: 1, comment: 'x'.repeat(100) }, headers);
    expect(created.status).toBe(200);
    expect(created.body.ratingCount).toBe(before.ratingCount + 1);
    const expectedAfterCreate = (before.ratingAvg * before.ratingCount + 1) / (before.ratingCount + 1);
    expect(created.body.ratingAvg).toBeCloseTo(expectedAfterCreate, 2);
    expect(created.body.review).toMatchObject({ rating: 1, reviewer: { firstName: 'Test' } });

    const updated = await postReview(slug, { rating: 5, comment: '  Changed my mind  ' }, headers);
    expect(updated.status).toBe(200);
    expect(updated.body.review.id).toBe(created.body.review.id);
    expect(updated.body.review.comment).toBe('Changed my mind');
    expect(updated.body.ratingCount).toBe(before.ratingCount + 1);
    const expectedAfterUpdate = (before.ratingAvg * before.ratingCount + 5) / (before.ratingCount + 1);
    expect(updated.body.ratingAvg).toBeCloseTo(expectedAfterUpdate, 2);
    expect(updated.body.ratingAvg).toBeGreaterThan(created.body.ratingAvg);

    const detail = await getBook(slug);
    expect(detail.body.ratingCount).toBe(updated.body.ratingCount);
    expect(detail.body.reviews[0]).toMatchObject({ id: updated.body.review.id, rating: 5 });
  });

  test('empty comment is stored as null', async () => {
    const { headers } = await registeredHeader();
    const res = await postReview(slug, { rating: 4, comment: '   ' }, headers);
    expect(res.body.review.comment).toBeNull();
  });

  test('concurrent reviews from different users are all counted', async () => {
    const before = await prisma.book.findUnique({ where: { id: bookId(slug) } });
    const reviewers = await Promise.all(Array.from({ length: 5 }, registeredHeader));
    const results = await Promise.all(reviewers.map(({ headers }) => postReview(slug, { rating: 3 }, headers)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);

    const after = await prisma.book.findUnique({ where: { id: bookId(slug) } });
    expect(after.ratingCount).toBe(before.ratingCount + 5);
    expect(after.ratingAvg).toBeCloseTo((before.ratingAvg * before.ratingCount + 15) / (before.ratingCount + 5), 6);
  });
});
