import { randomUUID } from 'node:crypto';
import { GIFT_POINT_VALUE_PAISE, formatINR } from 'bookworm-shared';
import { assertOrderAccess } from '../../lib/access.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { orderInclude, serializeOrder, serializePayment } from '../orders/orders.serializer.js';
import { releaseReservation } from '../orders/reservations.js';
import { createShipment } from '../shipments/shipments.service.js';

/** A business rule failed during confirmation: the payment is declined, nothing else changes. */
class PaymentDeclined extends Error {}

const CARD_METHODS = ['CREDIT_CARD', 'DEBIT_CARD'];

async function loadOrder(orderId) {
  return prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
}

function assertPayable(order, now) {
  if (order.status !== 'PENDING') {
    throw conflict(`Order ${order.orderNumber} is ${order.status.toLowerCase()} and cannot be paid`, 'ORDER_NOT_PENDING');
  }
  return order.reservedUntil >= now;
}

async function expire(orderId, now) {
  await prisma.$transaction((tx) => releaseReservation(tx, orderId, 'EXPIRED', now));
  return conflict('Your reservation has expired. Please check out again.', 'RESERVATION_EXPIRED');
}

/** "john.smith@okaxis" → "jo***@okaxis" */
export function maskUpi(upiId) {
  const [name, bank] = upiId.split('@');
  return `${name.slice(0, 2)}***@${bank}`;
}

function paymentDetails(method, { card, upiId }) {
  if (CARD_METHODS.includes(method)) {
    if (!card) throw badRequest('Card details are required for card payments', undefined, 'VALIDATION_ERROR');
    return { cardLast4: card.number.replace(/\D/g, '').slice(-4) };
  }
  if (method === 'UPI') {
    if (!upiId) throw badRequest('upiId is required for UPI payments', undefined, 'VALIDATION_ERROR');
    return { upiHandleMasked: maskUpi(upiId) };
  }
  return {};
}

function gatewayApproves(forceFailure) {
  if (forceFailure) return false;
  return process.env.PAYMENT_ALWAYS_SUCCESS !== 'false' || Math.random() > 0.1;
}

/** POST /payments/initiate */
export async function initiatePayment(user, { orderId, method }, now = new Date()) {
  const order = await loadOrder(orderId);
  assertOrderAccess(user, order);
  if (!assertPayable(order, now)) throw await expire(order.id, now);

  const payment = await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { paymentMethod: method } });
    return tx.payment.create({
      data: { orderId: order.id, sessionId: randomUUID(), method, amountPaise: order.totalPaise },
    });
  });

  const wallet =
    user.role === 'GUEST' ? undefined : await prisma.user.findUnique({ where: { id: user.id }, select: { walletBalancePaise: true } });
  return {
    sessionId: payment.sessionId,
    orderId: order.id,
    method,
    payableAmountPaise: payment.amountPaise,
    payableAmountInr: formatINR(payment.amountPaise),
    ...(wallet && { walletBalancePaise: wallet.walletBalancePaise }),
  };
}

/** Everything that happens when money is taken. Throws PaymentDeclined to roll back. */
async function finalizeOrder(tx, { order, payment, details, now }) {
  const claimed = await tx.payment.updateMany({
    where: { id: payment.id, status: 'INITIATED' },
    data: { status: 'SUCCEEDED', ...details },
  });
  if (claimed.count === 0) throw conflict('This payment has already been processed', 'PAYMENT_ALREADY_PROCESSED');

  const confirmed = await tx.order.updateMany({
    where: { id: order.id, status: 'PENDING', reservedUntil: { gte: now } },
    data: { status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: payment.method, confirmedAt: now },
  });
  if (confirmed.count === 0) throw new PaymentDeclined('Your reservation has expired');

  if (order.couponId) {
    const used = await tx.coupon.updateMany({
      where: { id: order.couponId, OR: [{ usageLimit: null }, { usedCount: { lt: tx.coupon.fields.usageLimit } }] },
      data: { usedCount: { increment: 1 } },
    });
    if (used.count === 0) throw new PaymentDeclined('Coupon usage limit reached');
  }

  if (order.giftPointsRedeemed > 0) {
    const debited = await tx.user.updateMany({
      where: { id: order.userId, giftPoints: { gte: order.giftPointsRedeemed } },
      data: { giftPoints: { decrement: order.giftPointsRedeemed } },
    });
    if (debited.count === 0) throw new PaymentDeclined('Not enough gift points');
    await tx.giftPointTransaction.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        points: order.giftPointsRedeemed,
        type: 'DEBIT',
        reason: `Redeemed on order ${order.orderNumber}`,
        createdAt: now,
      },
    });
  }

  if (payment.method === 'WALLET') {
    const charged = await tx.user.updateMany({
      where: { id: order.userId, walletBalancePaise: { gte: order.totalPaise } },
      data: { walletBalancePaise: { decrement: order.totalPaise } },
    });
    if (charged.count === 0) throw new PaymentDeclined('Insufficient wallet balance');
  }

  if (order.giftPointsEarned > 0) {
    await tx.user.update({ where: { id: order.userId }, data: { giftPoints: { increment: order.giftPointsEarned } } });
    await tx.giftPointTransaction.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        points: order.giftPointsEarned,
        type: 'CREDIT',
        reason: `Earned on order ${order.orderNumber}`,
        createdAt: now,
      },
    });
  }

  const bookIds = order.items.map((item) => item.bookId);
  await tx.cartItem.deleteMany({ where: { userId: order.userId, bookId: { in: bookIds } } });
  for (const item of order.items) {
    await tx.book.update({ where: { id: item.bookId }, data: { salesCount: { increment: item.quantity } } });
  }

  const digitalOnly = order.items.every((item) => item.book.format === 'EBOOK');
  const shipment = await createShipment(tx, {
    orderId: order.id,
    shippingRatePaise: order.deliveryChargePaise,
    digitalOnly,
    now,
  });
  await tx.orderItem.updateMany({ where: { orderId: order.id }, data: { deliveryDate: shipment.estimatedDelivery } });
  if (digitalOnly) await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });

  const books = await tx.book.findMany({ where: { id: { in: bookIds } }, select: { authorId: true } });
  const authorIds = [...new Set(books.map((book) => book.authorId))];
  await tx.authorFollow.createMany({
    data: authorIds.map((authorId) => ({ userId: order.userId, authorId, source: 'AUTO_PURCHASE', followedAt: now })),
    skipDuplicates: true,
  });
}

/** POST /payments/confirm — mock gateway; only the card's last 4 digits are kept. */
export async function confirmPayment(user, { sessionId, card, upiId, forceFailure = false }, now = new Date()) {
  const payment = await prisma.payment.findUnique({ where: { sessionId } });
  if (!payment) throw notFound('Payment session not found');
  const order = await loadOrder(payment.orderId);
  assertOrderAccess(user, order);

  if (payment.status !== 'INITIATED') throw conflict('This payment has already been processed', 'PAYMENT_ALREADY_PROCESSED');
  if (!assertPayable(order, now)) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: 'Reservation expired' } });
    throw await expire(order.id, now);
  }

  const details = paymentDetails(payment.method, { card, upiId });
  let declineReason = gatewayApproves(forceFailure) ? null : 'Payment declined';

  if (!declineReason) {
    try {
      await prisma.$transaction((tx) => finalizeOrder(tx, { order, payment, details, now }));
    } catch (error) {
      if (!(error instanceof PaymentDeclined)) throw error;
      declineReason = error.message;
    }
  }

  if (declineReason) {
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: declineReason, ...details } }),
      prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } }),
    ]);
  }

  const [updatedPayment, updatedOrder] = await Promise.all([
    prisma.payment.findUnique({ where: { id: payment.id } }),
    loadOrder(order.id),
  ]);
  return {
    success: !declineReason,
    reason: declineReason,
    payment: serializePayment(updatedPayment),
    order: serializeOrder(updatedOrder, now),
  };
}

/** GET /payments/wallet */
export async function getWallet(userId) {
  const { giftPoints, walletBalancePaise } = await prisma.user.findUnique({
    where: { id: userId },
    select: { giftPoints: true, walletBalancePaise: true },
  });
  const giftPointsValuePaise = giftPoints * GIFT_POINT_VALUE_PAISE;
  return {
    giftPoints,
    giftPointsValuePaise,
    giftPointsValueInr: formatINR(giftPointsValuePaise),
    walletBalancePaise,
    walletBalanceInr: formatINR(walletBalancePaise),
  };
}
