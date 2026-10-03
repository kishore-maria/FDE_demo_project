import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { authHeader, createUser, tokenFor } from './factories.js';

const app = createApp();
const bookId = (slug) => stableId('book', slug);

const api = (headers) => ({
  list: () => request(app).get('/api/wishlist').set(headers),
  add: (id) => request(app).post('/api/wishlist').set(headers).send({ bookId: id }),
  remove: (id) => request(app).delete(`/api/wishlist/${id}`).set(headers),
});

async function newWishlist() {
  const { user } = await createUser();
  return api(authHeader(tokenFor(user)));
}

const slugs = (res) => res.body.items.map((i) => i.book.slug);

describe('wishlist', () => {
  test('starts empty', async () => {
    const wishlist = await newWishlist();
    const res = await wishlist.list();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  test('add returns the item with book details', async () => {
    const wishlist = await newWishlist();
    const res = await wishlist.add(bookId('joy-of-minimalism'));
    expect(res.status).toBe(200);
    expect(res.body.book).toMatchObject({ slug: 'joy-of-minimalism', priceInr: '₹149', author: { name: 'Daniel Reed' } });
    expect(Date.parse(res.body.addedAt)).not.toBeNaN();
  });

  test('adding the same book again is idempotent', async () => {
    const wishlist = await newWishlist();
    const first = await wishlist.add(bookId('joy-of-minimalism'));
    const second = await wishlist.add(bookId('joy-of-minimalism'));
    expect(second.status).toBe(200);
    expect(second.body.addedAt).toBe(first.body.addedAt);
    expect(slugs(await wishlist.list())).toEqual(['joy-of-minimalism']);
  });

  test('lists newest first', async () => {
    const wishlist = await newWishlist();
    await wishlist.add(bookId('joy-of-minimalism'));
    await wishlist.add(bookId('the-path-to-success'));
    expect(slugs(await wishlist.list())).toEqual(['the-path-to-success', 'joy-of-minimalism']);
  });

  test('book detail reflects the wishlist flag', async () => {
    const { user } = await createUser();
    const headers = authHeader(tokenFor(user));
    await api(headers).add(bookId('joy-of-minimalism'));
    const detail = await request(app).get(`/api/books/${bookId('joy-of-minimalism')}`).set(headers);
    expect(detail.body.isWishlisted).toBe(true);
  });

  test('remove returns the remaining list; removing again is 404', async () => {
    const wishlist = await newWishlist();
    await wishlist.add(bookId('joy-of-minimalism'));
    await wishlist.add(bookId('the-path-to-success'));

    const res = await wishlist.remove(bookId('joy-of-minimalism'));
    expect(res.status).toBe(200);
    expect(slugs(res)).toEqual(['the-path-to-success']);

    const again = await wishlist.remove(bookId('joy-of-minimalism'));
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOT_IN_WISHLIST');
  });

  test('wishlists are isolated per user', async () => {
    const a = await newWishlist();
    const b = await newWishlist();
    await a.add(bookId('joy-of-minimalism'));
    expect((await b.list()).body.items).toEqual([]);
    expect((await b.remove(bookId('joy-of-minimalism'))).status).toBe(404);
  });

  test('unknown book is 404; malformed id or extra fields are 400', async () => {
    const wishlist = await newWishlist();
    expect((await wishlist.add(randomUUID())).status).toBe(404);
    expect((await wishlist.add('not-a-uuid')).status).toBe(400);
    expect((await wishlist.remove('not-a-uuid')).status).toBe(400);

    const { user } = await createUser();
    const extra = await request(app)
      .post('/api/wishlist')
      .set(authHeader(tokenFor(user)))
      .send({ bookId: bookId('joy-of-minimalism'), note: 'x' });
    expect(extra.status).toBe(400);
  });

  test('anonymous is 401', async () => {
    expect((await request(app).get('/api/wishlist')).status).toBe(401);
    expect((await request(app).post('/api/wishlist').send({ bookId: bookId('joy-of-minimalism') })).status).toBe(401);
  });

  test('guests are 403', async () => {
    const { user } = await createUser({ role: 'GUEST' });
    const guest = api(authHeader(tokenFor(user, { gsid: randomUUID() })));
    for (const res of [await guest.list(), await guest.add(bookId('joy-of-minimalism')), await guest.remove(bookId('joy-of-minimalism'))]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});
