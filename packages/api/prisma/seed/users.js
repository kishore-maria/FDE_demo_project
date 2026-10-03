import bcrypt from 'bcryptjs';
import { computeOrderTotals } from 'bookworm-shared';
import {
  DEMO_PASSWORDS,
  WELCOME_BONUS_POINTS,
  coupons,
  customerAddress,
  customerFollows,
  customerOrders,
  users,
} from './data/users.js';
import { stableId } from './ids.js';

const { isDefault: _isDefault, ...addressSnapshot } = customerAddress;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days, now) => new Date(now.getTime() - days * DAY_MS);
const hoursAfter = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);

async function seedUsers(prisma) {
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const ids = {};
  for (const { key, ...user } of users) {
    const data = { ...user, passwordHash: await bcrypt.hash(DEMO_PASSWORDS[key], rounds) };
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      create: { id: stableId('user', user.email), ...data },
      update: data,
    });
    ids[key] = saved.id;
  }
  return ids;
}

async function seedCoupons(prisma) {
  const ids = {};
  for (const { validUntil, ...coupon } of coupons) {
    const data = { ...coupon, validUntil: new Date(validUntil) };
    // usedCount is only set on create so re-seeding never rewrites real usage.
    const usedCount = customerOrders.filter((o) => o.couponCode === coupon.code).length;
    const saved = await prisma.coupon.upsert({
      where: { code: coupon.code },
      create: { id: stableId('coupon', coupon.code), ...data, usedCount },
      update: data,
    });
    ids[coupon.code] = saved;
  }
  return ids;
}

async function seedCustomerOrder(prisma, order, { userId, coupon, now }) {
  const orderId = stableId('order', order.key);
  const placedAt = daysAgo(order.placedDaysAgo, now);
  const deliveredAt = daysAgo(order.deliveredDaysAgo, now);

  const books = await prisma.book.findMany({
    where: { id: { in: order.items.map((item) => stableId('book', item.book)) } },
  });
  const bookById = new Map(books.map((book) => [book.id, book]));
  const lines = order.items.map((item) => {
    const book = bookById.get(stableId('book', item.book));
    return { book, quantity: item.quantity };
  });

  const totals = computeOrderTotals({
    items: lines.map(({ book, quantity }) => ({
      pricePaise: book.pricePaise,
      quantity,
      format: book.format,
    })),
    coupon,
  });

  const orderData = {
    orderNumber: order.orderNumber,
    userId,
    contactEmail: customerAddress.email,
    shippingAddress: addressSnapshot,
    couponId: coupon?.id ?? null,
    subtotalPaise: totals.subtotalPaise,
    taxPaise: totals.taxPaise,
    couponDiscountPaise: totals.couponDiscountPaise,
    giftDiscountPaise: totals.giftDiscountPaise,
    deliveryChargePaise: totals.deliveryChargePaise,
    totalPaise: totals.totalPaise,
    giftPointsRedeemed: totals.giftPointsRedeemed,
    giftPointsEarned: totals.pointsEarned,
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    paymentMethod: order.payment.method,
    createdAt: placedAt,
    confirmedAt: placedAt,
  };
  await prisma.order.upsert({
    where: { id: orderId },
    create: { id: orderId, ...orderData },
    update: orderData,
  });

  for (const { book, quantity } of lines) {
    const itemId = stableId('order-item', `${order.key}:${book.slug}`);
    const itemData = {
      orderId,
      bookId: book.id,
      titleSnapshot: book.title,
      quantity,
      priceAtPurchasePaise: book.pricePaise,
      deliveryDate: deliveredAt,
    };
    await prisma.orderItem.upsert({
      where: { id: itemId },
      create: { id: itemId, ...itemData },
      update: itemData,
    });
  }

  const paymentId = stableId('payment', order.key);
  const paymentData = {
    orderId,
    sessionId: stableId('payment-session', order.key),
    method: order.payment.method,
    amountPaise: totals.totalPaise,
    status: 'SUCCEEDED',
    cardLast4: order.payment.cardLast4 ?? null,
    upiHandleMasked: order.payment.upiHandleMasked ?? null,
    createdAt: placedAt,
  };
  await prisma.payment.upsert({
    where: { id: paymentId },
    create: { id: paymentId, ...paymentData },
    update: paymentData,
  });

  const shipmentId = stableId('shipment', order.key);
  const shipmentData = {
    orderId,
    type: 'FORWARD',
    trackingNumber: order.trackingNumber,
    status: 'DELIVERED',
    estimatedDelivery: deliveredAt,
    actualDelivery: deliveredAt,
    shippingRatePaise: totals.deliveryChargePaise,
    createdAt: placedAt,
  };
  await prisma.shipment.upsert({
    where: { id: shipmentId },
    create: { id: shipmentId, ...shipmentData },
    update: shipmentData,
  });

  const events = [
    { status: 'PROCESSING', note: 'Order confirmed and being packed', occurredAt: placedAt },
    { status: 'SHIPPED', note: 'Handed over to BookWorm Express', occurredAt: hoursAfter(placedAt, 20) },
    { status: 'OUT_FOR_DELIVERY', note: 'Out for delivery', occurredAt: hoursAfter(deliveredAt, -6) },
    { status: 'DELIVERED', note: 'Delivered to customer', occurredAt: deliveredAt },
  ];
  for (const event of events) {
    const eventId = stableId('shipment-event', `${order.key}:${event.status}`);
    await prisma.shipmentEvent.upsert({
      where: { id: eventId },
      create: { id: eventId, shipmentId, ...event },
      update: event,
    });
  }

  const txnId = stableId('gift-points', `${order.key}:earned`);
  const txnData = {
    userId,
    orderId,
    points: totals.pointsEarned,
    type: 'CREDIT',
    reason: `Earned on order ${order.orderNumber}`,
    createdAt: deliveredAt,
  };
  await prisma.giftPointTransaction.upsert({
    where: { id: txnId },
    create: { id: txnId, ...txnData },
    update: txnData,
  });

  return totals;
}

/**
 * Seeds demo accounts, the customer's address, coupons, two delivered past orders
 * (with payments, shipments, events and gift points) and author follows. Idempotent.
 */
export async function seedUsersAndOrders(prisma, now = new Date()) {
  const userIds = await seedUsers(prisma);
  const customerId = userIds.customer;

  const addressId = stableId('address', 'customer-default');
  const addressData = { userId: customerId, ...customerAddress };
  await prisma.address.upsert({
    where: { id: addressId },
    create: { id: addressId, ...addressData },
    update: addressData,
  });

  const couponsByCode = await seedCoupons(prisma);

  const bonusId = stableId('gift-points', 'customer:welcome-bonus');
  const bonusData = {
    userId: customerId,
    points: WELCOME_BONUS_POINTS,
    type: 'CREDIT',
    reason: 'Welcome bonus',
    createdAt: daysAgo(45, now),
  };
  await prisma.giftPointTransaction.upsert({
    where: { id: bonusId },
    create: { id: bonusId, ...bonusData },
    update: bonusData,
  });

  for (const order of customerOrders) {
    await seedCustomerOrder(prisma, order, {
      userId: customerId,
      coupon: order.couponCode ? couponsByCode[order.couponCode] : null,
      now,
    });
  }

  for (const follow of customerFollows) {
    const authorId = stableId('author', follow.author);
    await prisma.authorFollow.upsert({
      where: { userId_authorId: { userId: customerId, authorId } },
      create: {
        id: stableId('follow', `customer:${follow.author}`),
        userId: customerId,
        authorId,
        source: follow.source,
      },
      update: { source: follow.source },
    });
  }

  return {
    users: users.length,
    coupons: coupons.length,
    orders: customerOrders.length,
    follows: customerFollows.length,
  };
}
