import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authHeader, createOrder, createUser, loginAs, tokenFor } from './factories.js';

const app = createApp();
const authorId = (slug) => stableId('author', slug);
const names = (res) => res.body.items.map((a) => a.name);
const get = (path, headers = {}) => request(app).get(`/api${path}`).set(headers);
const follow = (slug, headers) => request(app).post(`/api/authors/${authorId(slug)}/follow`).set(headers);
const unfollow = (slug, headers) => request(app).delete(`/api/authors/${authorId(slug)}/follow`).set(headers);

async function registered() {
  const { user } = await createUser();
  return { user, headers: authHeader(tokenFor(user)) };
}

async function guest() {
  const { user } = await createUser({ role: 'GUEST' });
  return authHeader(tokenFor(user, { gsid: randomUUID() }));
}

const customerHeaders = async () => authHeader(await loginAs(app, 'customer@test.com'));

describe('GET /api/authors', () => {
  test('lists all 12 authors alphabetically with counts and top category', async () => {
    const res = await get('/authors');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(12);
    expect(names(res)).toEqual([...names(res)].sort((a, b) => a.localeCompare(b)));
    expect(res.body.items.reduce((sum, a) => sum + a.bookCount, 0)).toBe(36);

    const daniel = res.body.items.find((a) => a.slug === 'daniel-reed');
    expect(daniel).toMatchObject({ bookCount: 4, topCategory: { slug: 'self-help', name: 'Self-help' } });
    expect(daniel.bio).toBeTruthy();
  });

  test('anonymous responses omit isFollowing', async () => {
    const res = await get('/authors');
    for (const author of res.body.items) expect(author).not.toHaveProperty('isFollowing');
  });

  test('customer sees which authors they follow', async () => {
    const res = await get('/authors', await customerHeaders());
    const followed = res.body.items.filter((a) => a.isFollowing).map((a) => a.name);
    expect(followed.sort()).toEqual(['Daniel Reed', 'Sophia Bennett']);
    expect(res.body.items.every((a) => typeof a.isFollowing === 'boolean')).toBe(true);
  });

  test('guests see isFollowing false', async () => {
    const res = await get('/authors', await guest());
    expect(res.body.items.every((a) => a.isFollowing === false)).toBe(true);
  });
});

describe('GET /api/authors/:authorId', () => {
  test('returns the profile with books newest first', async () => {
    const res = await get(`/authors/${authorId('daniel-reed')}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Daniel Reed', bookCount: 4 });
    expect(res.body.books).toHaveLength(4);
    expect(res.body.books[0].title).toBe('Joy of Minimalism');
    expect(res.body.books.every((b) => b.author.slug === 'daniel-reed')).toBe(true);
    expect(res.body).not.toHaveProperty('isFollowing');
  });

  test('includes isFollowing for an authenticated customer', async () => {
    const res = await get(`/authors/${authorId('daniel-reed')}`, await customerHeaders());
    expect(res.body.isFollowing).toBe(true);
  });

  test('malformed id is 400, unknown id is 404', async () => {
    expect((await get('/authors/not-a-uuid')).status).toBe(400);
    const missing = await get(`/authors/${randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});

describe('My Writers', () => {
  test('following lists the customer\'s 2 authors', async () => {
    const res = await get('/authors/following', await customerHeaders());
    expect(res.status).toBe(200);
    expect(names(res).sort()).toEqual(['Daniel Reed', 'Sophia Bennett']);
    expect(res.body.items.every((a) => a.isFollowing === true)).toBe(true);
  });

  test('new releases come only from followed authors, newest first, max 12', async () => {
    const res = await get('/authors/following/new-releases', await customerHeaders());
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.length).toBeLessThanOrEqual(12);
    for (const book of res.body.items) expect(['daniel-reed', 'sophia-bennett']).toContain(book.author.slug);
    expect(res.body.items[0].title).toBe('Joy of Minimalism');
  });

  test('suggestions are authors in purchased genres the customer does not follow', async () => {
    const res = await get('/authors/suggestions', await customerHeaders());
    expect(res.status).toBe(200);
    expect(names(res)).not.toContain('Daniel Reed');
    expect(names(res)).not.toContain('Sophia Bennett');
    expect(names(res)).toEqual(expect.arrayContaining(['Arjun Patel', 'James Adams', 'Clara Nelson']));
    // James Adams has two mystery/thriller books, more than anyone else.
    expect(res.body.items[0].name).toBe('James Adams');
    expect(res.body.items.every((a) => a.isFollowing === false)).toBe(true);
  });

  test('a user with no purchases gets no suggestions', async () => {
    const { headers } = await registered();
    const res = await get('/authors/suggestions', headers);
    expect(res.body.items).toEqual([]);
  });

  test.each(['/authors/following', '/authors/following/new-releases', '/authors/suggestions'])(
    '%s needs a registered user',
    async (path) => {
      expect((await get(path)).status).toBe(401);
      expect((await get(path, await guest())).status).toBe(403);
    },
  );
});

describe('follow / unfollow', () => {
  test('follow 201, duplicate 409, unfollow 200, unfollow again 404', async () => {
    const { user, headers } = await registered();

    const followed = await follow('laura-mitchell', headers);
    expect(followed.status).toBe(201);
    expect(followed.body).toEqual({ authorId: authorId('laura-mitchell'), isFollowing: true });
    const row = await prisma.authorFollow.findUnique({
      where: { userId_authorId: { userId: user.id, authorId: authorId('laura-mitchell') } },
    });
    expect(row.source).toBe('MANUAL');

    const duplicate = await follow('laura-mitchell', headers);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ALREADY_FOLLOWING');

    expect(names(await get('/authors/following', headers))).toEqual(['Laura Mitchell']);

    const removed = await unfollow('laura-mitchell', headers);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ authorId: authorId('laura-mitchell'), isFollowing: false });

    const again = await unfollow('laura-mitchell', headers);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOT_FOLLOWING');
  });

  test('following removes the author from suggestions', async () => {
    const { user, headers } = await registered();
    await createOrder(user.id, ['the-final-frontier']);

    expect(names(await get('/authors/suggestions', headers))).toContain('Laura Mitchell');
    await follow('laura-mitchell', headers);
    expect(names(await get('/authors/suggestions', headers))).not.toContain('Laura Mitchell');
  });

  test('unknown author is 404 for follow and unfollow', async () => {
    const { headers } = await registered();
    const id = randomUUID();
    expect((await request(app).post(`/api/authors/${id}/follow`).set(headers)).status).toBe(404);
    expect((await request(app).delete(`/api/authors/${id}/follow`).set(headers)).status).toBe(404);
  });

  test('anonymous is 401, guest is 403', async () => {
    expect((await follow('laura-mitchell', {})).status).toBe(401);
    const res = await follow('laura-mitchell', await guest());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
