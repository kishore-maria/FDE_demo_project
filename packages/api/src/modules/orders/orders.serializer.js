import { CANCEL_WINDOW_HOURS, RETURN_WINDOW_DAYS, formatDeliveryDate, formatINR } from 'bookworm-shared';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Prisma include needed by serializeOrder. */
export const orderInclude = {
  coupon: { select: { code: true } },
  items: {
    include: { book: { select: { format: true, coverImageUrl: true, author: { select: { name: true } } } } },
    orderBy: [{ titleSnapshot: 'asc' }, { id: 'asc' }],
  },
  payments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  shipments: {
    include: { events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
};

const money = (paise) => formatINR(paise);

export function orderFlags(order, now = new Date()) {
  const forward = order.shipments.find((shipment) => shipment.type === 'FORWARD');
  const forwardNotShipped = !forward || forward.status === 'PROCESSING';
  const withinCancelWindow = now - order.createdAt <= CANCEL_WINDOW_HOURS * HOUR_MS;
  const deliveredAt = forward?.actualDelivery;

  return {
    canCancel: ['PENDING', 'CONFIRMED'].includes(order.status) && forwardNotShipped && withinCancelWindow,
    canReturn: order.status === 'DELIVERED' && Boolean(deliveredAt) && now - deliveredAt <= RETURN_WINDOW_DAYS * DAY_MS,
    canModifyAddress: order.status === 'CONFIRMED' && forward?.status === 'PROCESSING',
  };
}

export function serializeTotals(order) {
  return {
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalPaise: order.subtotalPaise,
    subtotalInr: money(order.subtotalPaise),
    taxPaise: order.taxPaise,
    taxInr: money(order.taxPaise),
    deliveryChargePaise: order.deliveryChargePaise,
    deliveryChargeInr: money(order.deliveryChargePaise),
    couponDiscountPaise: order.couponDiscountPaise,
    couponDiscountInr: money(order.couponDiscountPaise),
    giftDiscountPaise: order.giftDiscountPaise,
    giftDiscountInr: money(order.giftDiscountPaise),
    totalPaise: order.totalPaise,
    totalInr: money(order.totalPaise),
    giftPointsRedeemed: order.giftPointsRedeemed,
    giftPointsEarned: order.giftPointsEarned,
  };
}

export function serializeOrderItem(item) {
  const lineTotalPaise = item.priceAtPurchasePaise * item.quantity;
  return {
    id: item.id,
    bookId: item.bookId,
    title: item.titleSnapshot,
    authorName: item.book.author.name,
    coverImageUrl: item.book.coverImageUrl,
    format: item.book.format,
    quantity: item.quantity,
    priceAtPurchasePaise: item.priceAtPurchasePaise,
    priceAtPurchaseInr: money(item.priceAtPurchasePaise),
    lineTotalPaise,
    lineTotalInr: money(lineTotalPaise),
    deliveryDate: item.deliveryDate ?? null,
  };
}

export function serializePayment(payment) {
  return {
    id: payment.id,
    sessionId: payment.sessionId,
    method: payment.method,
    amountPaise: payment.amountPaise,
    amountInr: money(payment.amountPaise),
    status: payment.status,
    cardLast4: payment.cardLast4 ?? null,
    upiHandleMasked: payment.upiHandleMasked ?? null,
    failureReason: payment.failureReason ?? null,
    createdAt: payment.createdAt,
    refundedAt: payment.refundedAt ?? null,
  };
}

export function serializeShipment(shipment) {
  return {
    id: shipment.id,
    type: shipment.type,
    trackingNumber: shipment.trackingNumber,
    carrier: shipment.carrier,
    status: shipment.status,
    estimatedDelivery: shipment.estimatedDelivery,
    estimatedDeliveryText: formatDeliveryDate(shipment.estimatedDelivery),
    actualDelivery: shipment.actualDelivery ?? null,
    shippingRatePaise: shipment.shippingRatePaise,
    shippingRateInr: money(shipment.shippingRatePaise),
    events: shipment.events.map(({ status, note, occurredAt }) => ({ status, note, occurredAt })),
  };
}

export function serializeOrderSummary(order, now = new Date()) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    totals: serializeTotals(order),
    items: order.items.map(serializeOrderItem),
    flags: orderFlags(order, now),
  };
}

/** Full order (owner view). Expects `orderInclude`. */
export function serializeOrder(order, now = new Date()) {
  return {
    ...serializeOrderSummary(order, now),
    contactEmail: order.contactEmail,
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod ?? null,
    couponCode: order.coupon?.code ?? null,
    reservedUntil: order.reservedUntil ?? null,
    confirmedAt: order.confirmedAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    payments: order.payments.map(serializePayment),
    shipments: order.shipments.map(serializeShipment),
  };
}
