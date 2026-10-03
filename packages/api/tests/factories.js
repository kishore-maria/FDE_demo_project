import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
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
