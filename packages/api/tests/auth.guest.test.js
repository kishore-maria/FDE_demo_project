import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { assertOrderAccess } from '../src/lib/access.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();
const guestEmail = () => `guest-${randomUUID()}@example.com`;
const guestSession = (email) => request(app).post('/api/auth/guest-session').send({ email });

describe('POST /api/auth/guest-session', () => {
  test('creates a GUEST user and a 24h token with a guest session id', async () => {
    const email = guestEmail();
    const res = await guestSession(email);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email, role: 'GUEST', giftPoints: 0 });
    const claims = jwt.decode(res.body.token);
    expect(claims).toMatchObject({ sub: res.body.user.id, role: 'GUEST' });
    expect(claims.gsid).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims.exp - claims.iat).toBe(24 * 60 * 60);

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).toMatchObject({ role: 'GUEST', passwordHash: null });
  });

  test('same email twice reuses the user but starts a new guest session', async () => {
    const email = guestEmail();
    const first = await guestSession(email);
    const second = await guestSession(email.toUpperCase());
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(jwt.decode(second.body.token).gsid).not.toBe(jwt.decode(first.body.token).gsid);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  test('registered email returns 409 ACCOUNT_EXISTS and leaves the account untouched', async () => {
    const before = await prisma.user.findUnique({ where: { email: 'customer@test.com' } });
    const res = await guestSession('customer@test.com');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS');
    expect(res.body.token).toBeUndefined();

    const after = await prisma.user.findUnique({ where: { email: 'customer@test.com' } });
    expect(after.role).toBe('CUSTOMER');
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await bcrypt.compare('Test@1234', after.passwordHash)).toBe(true);
  });

  test('admin email is rejected too', async () => {
    expect((await guestSession('ADMIN@bookworm.com')).status).toBe(409);
  });

  test.each([
    ['missing email', {}],
    ['invalid email', { email: 'not-an-email' }],
    ['extra fields', { email: 'x@example.com', role: 'ADMIN' }],
  ])('%s returns 400', async (_label, body) => {
    const res = await request(app).post('/api/auth/guest-session').send(body);
    expect(res.status).toBe(400);
  });

  test('guest token works for the profile endpoint', async () => {
    const { body } = await guestSession(guestEmail());
    const res = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('GUEST');
  });
});

describe('assertOrderAccess', () => {
  const customer = { id: 'u1', role: 'CUSTOMER', gsid: null };
  const guest = { id: 'g1', role: 'GUEST', gsid: 'session-a' };

  test('owner can access their order', () => {
    const order = { userId: 'u1', guestSessionId: null };
    expect(assertOrderAccess(customer, order)).toBe(order);
  });

  test("another user's order is reported as not found", () => {
    expect(() => assertOrderAccess(customer, { userId: 'u2' })).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });

  test('guest can access an order from the same guest session', () => {
    expect(() => assertOrderAccess(guest, { userId: 'g1', guestSessionId: 'session-a' })).not.toThrow();
  });

  test('guest cannot access their own order from a different guest session', () => {
    expect(() => assertOrderAccess(guest, { userId: 'g1', guestSessionId: 'session-b' })).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });

  test('guest with no session id is rejected', () => {
    expect(() =>
      assertOrderAccess({ ...guest, gsid: null }, { userId: 'g1', guestSessionId: null }),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });

  test('missing order is reported as not found', () => {
    expect(() => assertOrderAccess(customer, null)).toThrow(expect.objectContaining({ status: 404 }));
  });
});
