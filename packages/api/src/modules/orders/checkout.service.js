import { ORDER_RESERVATION_MINUTES, computeOrderTotals, generateOrderNumber } from 'bookworm-shared';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { checkCoupon } from '../coupons/coupons.service.js';
import { toAddressData } from '../users/addresses.serializer.js';
import { orderInclude, serializeOrder } from './orders.serializer.js';
import { releaseReservation } from './reservations.js';

const MINUTE_MS = 60 * 1000;

async function resolveAddress(tx, user, { addressId, address, saveAddress }) {
  if (Boolean(addressId) === Boolean(address)) {
    throw badRequest('Provide either addressId or address', undefined, 'VALIDATION_ERROR');
  }

  if (addressId) {
    const saved = await tx.address.findFirst({ where: { id: addressId, userId: user.id } });
    if (!saved) throw notFound('Address not found');
    return toAddressData(saved);
  }

  const snapshot = toAddressData(address);
  if (saveAddress && user.role !== 'GUEST') {
    const hasAny = (await tx.address.count({ where: { userId: user.id } })) > 0;
    await tx.address.create({ data: { userId: user.id, ...snapshot, isDefault: !hasAny } });
  }
  return snapshot;
}

function assertPointsAllowed(user, requested) {
  if (requested === 0) return;
  if (user.role === 'GUEST') {
    throw unprocessable('Guests cannot redeem gift points', 'POINTS_NOT_ALLOWED');
  }
  if (requested > user.giftPoints) {
    throw unprocessable(`You only have ${user.giftPoints} gift points`, 'INSUFFICIENT_POINTS', {
      available: user.giftPoints,
      requested,
    });
  }
}

/** Decrements stock only if enough is left, so concurrent checkouts can never oversell. */
async function reserveStock(tx, lines) {
  for (const { book, quantity } of lines) {
    const { count } = await tx.book.updateMany({
      where: { id: book.id, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (count === 0) {
      const { stockQuantity } = await tx.book.findUnique({ where: { id: book.id }, select: { stockQuantity: true } });
      throw conflict(`Only ${stockQuantity} copies of "${book.title}" are available`, 'INSUFFICIENT_STOCK', {
        bookId: book.id,
        available: stockQuantity,
        requested: quantity,
      });
    }
  }
}

/**
 * POST /orders/checkout — turns the cart into a PENDING order and reserves stock for 30 minutes.
 * The cart, coupon usage and gift points are left untouched until payment succeeds.
 */
export async function checkout(authUser, body, now = new Date()) {
  const giftPointsToRedeem = body.giftPointsToRedeem ?? 0;

  const order = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: authUser.id } });
    assertPointsAllowed(user, giftPointsToRedeem);

    const cart = await tx.cartItem.findMany({
      where: { userId: user.id },
      include: { book: { select: { id: true, title: true, pricePaise: true, format: true } } },
      orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
    });
    if (cart.length === 0) throw unprocessable('Your cart is empty', 'CART_EMPTY');

    const shippingAddress = await resolveAddress(tx, user, body);

    const pricedItems = cart.map(({ book, quantity }) => ({ pricePaise: book.pricePaise, quantity, format: book.format }));
    const subtotalPaise = pricedItems.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);

    let coupon = null;
    if (body.couponCode) {
      const result = await checkCoupon(body.couponCode, subtotalPaise, { now, db: tx });
      if (!result.coupon) throw unprocessable(result.message, `COUPON_${result.reason}`);
      coupon = result.coupon;
    }

    const previous = await tx.order.findMany({ where: { userId: user.id, status: 'PENDING' }, select: { id: true } });
    for (const { id } of previous) await releaseReservation(tx, id, 'CANCELLED', now);

    await reserveStock(tx, cart);

    const totals = computeOrderTotals({ items: pricedItems, coupon, giftPointsToRedeem });
    return tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user.id,
        guestSessionId: user.role === 'GUEST' ? authUser.gsid : null,
        contactEmail: user.email,
        shippingAddress,
        couponId: coupon?.id ?? null,
        subtotalPaise: totals.subtotalPaise,
        taxPaise: totals.taxPaise,
        couponDiscountPaise: totals.couponDiscountPaise,
        giftDiscountPaise: totals.giftDiscountPaise,
        deliveryChargePaise: totals.deliveryChargePaise,
        totalPaise: totals.totalPaise,
        giftPointsRedeemed: totals.giftPointsRedeemed,
        giftPointsEarned: totals.pointsEarned,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentMethod: body.paymentMethod,
        reservedUntil: new Date(now.getTime() + ORDER_RESERVATION_MINUTES * MINUTE_MS),
        createdAt: now,
        items: {
          create: cart.map(({ book, quantity }) => ({
            bookId: book.id,
            titleSnapshot: book.title,
            quantity,
            priceAtPurchasePaise: book.pricePaise,
          })),
        },
      },
      include: orderInclude,
    });
  });

  return { order: serializeOrder(order, now) };
}
