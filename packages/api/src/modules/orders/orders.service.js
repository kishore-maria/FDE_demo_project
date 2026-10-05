import { assertOrderAccess } from '../../lib/access.js';
import { conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { createShipment } from '../shipments/shipments.service.js';
import { toAddressData } from '../users/addresses.serializer.js';
import {
  orderFlags,
  orderInclude,
  serializeOrder,
  serializeOrderItem,
  serializeOrderSummary,
  serializeShipment,
  serializeTotals,
} from './orders.serializer.js';
import { refundOrder } from './refunds.js';
import { releaseReservation } from './reservations.js';

const DEFAULT_PAGE_SIZE = 12;

// Checkouts that were replaced or ran out of time without ever being paid are noise in the history.
const visibleInHistory = {
  NOT: { status: { in: ['CANCELLED', 'EXPIRED'] }, confirmedAt: null },
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

async function loadAccessibleOrder(user, orderId, db = prisma) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
  return assertOrderAccess(user, order);
}

/** GET /orders — registered users' history, newest first. */
export async function listOrders(userId, query, now = new Date()) {
  const page = toInt(query.page, 1);
  const pageSize = toInt(query.pageSize, DEFAULT_PAGE_SIZE);
  const where = { userId, ...visibleInHistory };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    items: orders.map((order) => serializeOrderSummary(order, now)),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** GET /orders/:id — owner only; guests only for orders from their current guest session. */
export async function getOrder(user, orderId, now = new Date()) {
  return serializeOrder(await loadAccessibleOrder(user, orderId), now);
}

/**
 * POST /orders/lookup — public Track Order. Email (case-insensitive) and order number must both match;
 * anything else is the same generic 404. No address or payment details are returned.
 */
export async function lookupOrder({ email, orderNumber }) {
  const order = await prisma.order.findFirst({
    where: {
      orderNumber: orderNumber.toUpperCase(),
      contactEmail: { equals: email.trim(), mode: 'insensitive' },
    },
    include: orderInclude,
  });
  if (!order) throw notFound('No order matches that email and order number');
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    items: order.items.map(serializeOrderItem),
    totals: serializeTotals(order),
    shipments: order.shipments.map(serializeShipment),
  };
}

/** Runs `change` in a transaction after re-checking the order's flag, then returns the fresh order. */
async function changeOrder(user, orderId, flag, error, change, now) {
  await prisma.$transaction(async (tx) => {
    const order = await loadAccessibleOrder(user, orderId, tx);
    if (!orderFlags(order, now)[flag]) throw error(order);
    await change(tx, order);
  });
  return getOrder(user, orderId, now);
}

/** POST /orders/:id/cancel — within 48h and before shipping; unpaid orders just release stock. */
export function cancelOrder(user, orderId, now = new Date()) {
  return changeOrder(
    user,
    orderId,
    'canCancel',
    (order) =>
      conflict(
        `Order ${order.orderNumber} can only be cancelled within 48 hours and before it ships`,
        'CANNOT_CANCEL',
      ),
    async (tx, order) => {
      if (order.status === 'PENDING') {
        await releaseReservation(tx, order.id, 'CANCELLED', now);
        return;
      }
      await refundOrder(tx, order.id, now);
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: now } });
    },
    now,
  );
}

/** POST /orders/:id/return — within 7 days of delivery; refund happens when the parcel is received. */
export function returnOrder(user, orderId, now = new Date()) {
  return changeOrder(
    user,
    orderId,
    'canReturn',
    (order) => conflict(`Order ${order.orderNumber} can only be returned within 7 days of delivery`, 'CANNOT_RETURN'),
    async (tx, order) => {
      await createShipment(tx, { orderId: order.id, type: 'RETURN', now });
      await tx.order.update({ where: { id: order.id }, data: { status: 'RETURN_REQUESTED' } });
    },
    now,
  );
}

/** PATCH /orders/:id/address — only while confirmed and not yet shipped. */
export function updateOrderAddress(user, orderId, address, now = new Date()) {
  return changeOrder(
    user,
    orderId,
    'canModifyAddress',
    (order) => conflict(`Order ${order.orderNumber} has already shipped`, 'CANNOT_MODIFY_ADDRESS'),
    (tx, order) => tx.order.update({ where: { id: order.id }, data: { shippingAddress: toAddressData(address) } }),
    now,
  );
}
