import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { generateOrderNumber } from 'bookworm-shared';
import request from 'supertest';
import { stableId } from '../prisma/seed/ids.js';
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

/** Minimal order for purchase-history tests; amounts are zero, books are seed slugs. */
export function createOrder(userId, bookSlugs, status = 'DELIVERED') {
  return prisma.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      userId,
      contactEmail: 'test@test.bookworm',
      shippingAddress: {},
      subtotalPaise: 0,
      taxPaise: 0,
      deliveryChargePaise: 0,
      totalPaise: 0,
      status,
      items: {
        create: bookSlugs.map((slug) => ({
          bookId: stableId('book', slug),
          titleSnapshot: slug,
          quantity: 1,
          priceAtPurchasePaise: 0,
        })),
      },
    },
  });
}

/** Temporarily sets a seeded book's stock, restoring the original value afterwards. */
export async function withStock(slug, stockQuantity, fn) {
  const id = stableId('book', slug);
  const { stockQuantity: original } = await prisma.book.findUnique({ where: { id } });
  await prisma.book.update({ where: { id }, data: { stockQuantity } });
  try {
    return await fn();
  } finally {
    await prisma.book.update({ where: { id }, data: { stockQuantity: original } });
  }
}
