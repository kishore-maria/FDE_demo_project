import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { signToken } from '../src/lib/jwt.js';
import { prisma } from '../src/lib/prisma.js';

export const DEFAULT_TEST_PASSWORD = 'Test@1234';

/** Creates a user with a unique email so mutating tests never share state. */
export async function createUser({ role = 'CUSTOMER', password = DEFAULT_TEST_PASSWORD, ...overrides } = {}) {
  const email = overrides.email ?? `user-${randomUUID()}@test.bookworm`;
  const passwordHash =
    role === 'GUEST' ? null : await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 4));
  const user = await prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'User',
      role,
      passwordHash,
      ...overrides,
      email,
    },
  });
  return { user, email, password };
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Logs in through the real endpoint and returns the token. */
export async function loginAs(app, email, password = DEFAULT_TEST_PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`loginAs(${email}) failed: ${res.status} ${res.text}`);
  return res.body.token;
}

/** Signs a token directly (no HTTP round-trip), e.g. for guests or custom claims. */
export function tokenFor(user, options) {
  return signToken(user, options);
}
