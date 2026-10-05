import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { badRequest, conflict, forbidden, unauthorized } from '../../lib/errors.js';
import { signToken } from '../../lib/jwt.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { serializeUser } from '../users/users.serializer.js';

export const normalizeEmail = (email) => email.trim().toLowerCase();

const emailInUse = () =>
  conflict('An account with this email already exists. Please log in instead.', 'EMAIL_IN_USE');

function authResponse(user, tokenOptions) {
  return { token: signToken(user, tokenOptions), user: serializeUser(user) };
}

/**
 * Creates a CUSTOMER account. Guest emails are also rejected: guests convert via set-password
 * from their own session, so registering can't be used to take over someone's guest orders.
 */
export async function register({ email, password, firstName, lastName, phone }) {
  const normalized = normalizeEmail(email);
  if (await prisma.user.findUnique({ where: { email: normalized } })) throw emailInUse();

  try {
    const user = await prisma.user.create({
      data: {
        email: normalized,
        passwordHash: await hashPassword(password),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone ?? null,
        role: 'CUSTOMER',
      },
    });
    return authResponse(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw emailInUse();
    throw error;
  }
}

/** Same 401 for unknown email, wrong password and password-less guests, so accounts can't be probed. */
export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !valid) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  return authResponse(user);
}

/**
 * Starts a guest checkout session. Registered emails must log in instead (409 ACCOUNT_EXISTS),
 * so a guest token can never be issued for a real account. Every call gets a fresh gsid, which
 * scopes the token to orders placed in this session only.
 */
export async function createGuestSession({ email }) {
  const normalized = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing && existing.role !== 'GUEST') {
    throw conflict('This email has an account. Please log in to continue.', 'ACCOUNT_EXISTS');
  }

  const user =
    existing ??
    (await prisma.user.upsert({
      where: { email: normalized },
      create: { email: normalized, role: 'GUEST', passwordHash: null },
      update: {},
    }));
  if (user.role !== 'GUEST') {
    throw conflict('This email has an account. Please log in to continue.', 'ACCOUNT_EXISTS');
  }

  return authResponse(user, { gsid: randomUUID() });
}

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('Account no longer exists');
  return serializeUser(user);
}

export async function updateProfile(userId, { firstName, lastName, phone }) {
  await getProfile(userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(firstName !== undefined && { firstName: firstName.trim() }),
      ...(lastName !== undefined && { lastName: lastName.trim() }),
      ...(phone !== undefined && { phone }),
    },
  });
  return serializeUser(user);
}

/**
 * PUT /auth/set-password — turns a guest into a CUSTOMER, keeping the same user id so every guest order
 * shows up in My Orders. Only allowed from a guest session that actually placed (paid for) an order.
 */
export async function setPassword(authUser, { password, confirmPassword }) {
  if (authUser.role !== 'GUEST') {
    throw badRequest('This account already has a password', undefined, 'ALREADY_REGISTERED');
  }
  if (password !== confirmPassword) {
    throw badRequest('Passwords do not match', { field: 'confirmPassword' }, 'PASSWORDS_DO_NOT_MATCH');
  }

  const order = await prisma.order.findFirst({
    where: { userId: authUser.id, guestSessionId: authUser.gsid ?? '', confirmedAt: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (!order) throw forbidden('Place an order in this session before creating a password', 'NO_GUEST_ORDER');

  const current = await prisma.user.findUnique({ where: { id: authUser.id } });
  const user = await prisma.user.update({
    where: { id: authUser.id },
    data: {
      passwordHash: await hashPassword(password),
      role: 'CUSTOMER',
      firstName: current.firstName || order.shippingAddress.firstName || '',
      lastName: current.lastName || order.shippingAddress.lastName || '',
      phone: current.phone ?? order.shippingAddress.phone ?? null,
    },
  });
  return authResponse(user);
}
