import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { authenticate } from '../src/middlewares/authenticate.js';
import { requireRegistered, requireRole } from '../src/middlewares/authorize.js';
import { authHeader, createUser, loginAs, tokenFor } from './factories.js';

const emptyPage = { items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 };

const app = createApp({
  registerTestRoutes(router) {
    router.get('/admin/orders', authenticate(), requireRole('ADMIN'), (req, res) => res.json(emptyPage));
    router.get('/wishlist', authenticate(), requireRegistered, (req, res) => res.json({ items: [] }));
    router.get('/books', authenticate({ optional: true }), (req, res) => {
      res.set('x-test-user-role', req.user?.role ?? 'anonymous').json(emptyPage);
    });
  },
});

const profile = (headers = {}) => request(app).get('/api/auth/profile').set(headers);

describe('authenticate middleware', () => {
  test('no token returns 401 UNAUTHORIZED', async () => {
    const res = await profile();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('non-Bearer authorization header returns 401', async () => {
    const res = await profile({ Authorization: 'Token abc' });
    expect(res.status).toBe(401);
  });

  test('malformed token returns 401', async () => {
    const res = await profile(authHeader('not-a-valid-jwt'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('expired token returns 401 TOKEN_EXPIRED', async () => {
    const { user } = await createUser();
    const expired = jwt.sign({ role: user.role, email: user.email }, process.env.JWT_SECRET, {
      subject: user.id,
      expiresIn: -10,
    });
    const res = await profile(authHeader(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('token signed with another secret returns 401', async () => {
    const { user } = await createUser();
    const forged = jwt.sign({ role: 'ADMIN' }, 'attacker-secret', { subject: user.id });
    expect((await profile(authHeader(forged))).status).toBe(401);
  });

  test('unsigned (alg "none") token returns 401', async () => {
    const { user } = await createUser();
    const unsigned = jwt.sign({ role: 'ADMIN' }, null, { algorithm: 'none', subject: user.id });
    expect((await profile(authHeader(unsigned))).status).toBe(401);
  });

  test('valid token returns the profile with gift points and wallet', async () => {
    const token = await loginAs(app, 'customer@test.com');
    const res = await profile(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'customer@test.com',
      giftPoints: 200,
      walletBalancePaise: 100000,
      walletBalanceInr: '₹1,000',
    });
    expect(res.body.passwordHash).toBeUndefined();
  });

  test('token for a deleted account returns 401', async () => {
    const { user } = await createUser();
    const token = tokenFor(user);
    await prisma.user.delete({ where: { id: user.id } });
    expect((await profile(authHeader(token))).status).toBe(401);
  });
});

describe('PUT /api/auth/profile', () => {
  test('updates name and phone', async () => {
    const { user } = await createUser();
    const res = await request(app)
      .put('/api/auth/profile')
      .set(authHeader(tokenFor(user)))
      .send({ firstName: 'Meera', phone: '9000000001' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'Meera', lastName: 'User', phone: '9000000001' });
  });

  test('empty body returns 400', async () => {
    const { user } = await createUser();
    const res = await request(app).put('/api/auth/profile').set(authHeader(tokenFor(user))).send({});
    expect(res.status).toBe(400);
  });

  test('email and role cannot be changed', async () => {
    const { user } = await createUser();
    const res = await request(app)
      .put('/api/auth/profile')
      .set(authHeader(tokenFor(user)))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  test('requires a token', async () => {
    const res = await request(app).put('/api/auth/profile').send({ firstName: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('requireRole / requireRegistered', () => {
  test('admin-only route rejects a customer with 403', async () => {
    const token = await loginAs(app, 'customer@test.com');
    const res = await request(app).get('/api/admin/orders').set(authHeader(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('admin-only route allows an admin', async () => {
    const token = await loginAs(app, 'admin@bookworm.com', 'Admin@1234');
    const res = await request(app).get('/api/admin/orders').set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test('admin-only route without a token returns 401', async () => {
    expect((await request(app).get('/api/admin/orders')).status).toBe(401);
  });

  test('registered-only route rejects guests with 403', async () => {
    const { user } = await createUser({ role: 'GUEST' });
    const res = await request(app).get('/api/wishlist').set(authHeader(tokenFor(user, { gsid: 'g1' })));
    expect(res.status).toBe(403);
  });

  test('registered-only route allows customers', async () => {
    const token = await loginAs(app, 'customer@test.com');
    expect((await request(app).get('/api/wishlist').set(authHeader(token))).status).toBe(200);
  });
});

describe('optional authentication', () => {
  const role = async (headers) =>
    (await request(app).get('/api/books').set(headers)).headers['x-test-user-role'];

  test('no token continues anonymously', async () => {
    expect(await role({})).toBe('anonymous');
  });

  test('invalid token is ignored', async () => {
    expect(await role(authHeader('garbage'))).toBe('anonymous');
  });

  test('valid token identifies the user', async () => {
    expect(await role(authHeader(await loginAs(app, 'customer@test.com')))).toBe('CUSTOMER');
  });
});

describe('guest tokens', () => {
  test('carry the guest session id and a 24h lifetime', async () => {
    const { user } = await createUser({ role: 'GUEST' });
    const claims = jwt.decode(tokenFor(user, { gsid: 'session-123' }));
    expect(claims).toMatchObject({ role: 'GUEST', gsid: 'session-123' });
    expect(claims.exp - claims.iat).toBe(24 * 60 * 60);
  });
});
