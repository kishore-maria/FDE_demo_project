import {
  DELIVERY_BUSINESS_DAYS,
  DELIVERY_CHARGE_PAISE,
  FREE_DELIVERY_THRESHOLD_PAISE,
  addBusinessDays,
  formatDeliveryDate,
  formatINR,
  generateTrackingNumber,
} from 'bookworm-shared';
import { assertOrderAccess } from '../../lib/access.js';
import { conflict, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { serializeShipment } from '../orders/orders.serializer.js';
import { completeReturn } from '../orders/refunds.js';

const NEXT_STATUS = { PROCESSING: 'SHIPPED', SHIPPED: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
const eventsInclude = { events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } };

const FORWARD_NOTES = {
  PROCESSING: 'Order confirmed and being packed',
  SHIPPED: 'Handed over to BookWorm Express',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered to customer',
};

const RETURN_NOTES = {
  PROCESSING: 'Return requested, pickup being scheduled',
  SHIPPED: 'Picked up from customer',
  OUT_FOR_DELIVERY: 'On the way back to the warehouse',
  DELIVERED: 'Received at the warehouse',
};

export const shipmentNote = (type, status) => (type === 'RETURN' ? RETURN_NOTES : FORWARD_NOTES)[status];

/**
 * Creates a shipment with its first tracking event. eBook-only forward shipments are delivered
 * instantly (digital download), everything else starts in PROCESSING.
 */
export async function createShipment(tx, { orderId, type = 'FORWARD', shippingRatePaise = 0, digitalOnly = false, now = new Date() }) {
  const instant = type === 'FORWARD' && digitalOnly;
  const estimatedDelivery = instant ? now : addBusinessDays(now, DELIVERY_BUSINESS_DAYS);
  const events = [{ status: 'PROCESSING', note: shipmentNote(type, 'PROCESSING'), occurredAt: now }];
  if (instant) {
    events.push({ status: 'DELIVERED', note: 'Available for instant download', occurredAt: new Date(now.getTime() + 1) });
  }

  return tx.shipment.create({
    data: {
      orderId,
      type,
      trackingNumber: generateTrackingNumber(),
      status: instant ? 'DELIVERED' : 'PROCESSING',
      estimatedDelivery,
      actualDelivery: instant ? now : null,
      shippingRatePaise,
      createdAt: now,
      events: { create: events },
    },
  });
}

/** POST /shipments/calculate-rate — same rules as computeOrderTotals' delivery charge. */
export function calculateRate({ subtotalPaise, allDigital = false }, now = new Date()) {
  const free = allDigital || subtotalPaise >= FREE_DELIVERY_THRESHOLD_PAISE;
  const shippingRatePaise = free ? 0 : DELIVERY_CHARGE_PAISE;
  const estimatedDelivery = allDigital ? now : addBusinessDays(now, DELIVERY_BUSINESS_DAYS);
  return {
    shippingRatePaise,
    shippingRateInr: formatINR(shippingRatePaise),
    freeShippingEligible: free,
    estimatedDelivery,
    estimatedDeliveryText: allDigital ? 'Instant download' : formatDeliveryDate(estimatedDelivery),
  };
}

/** GET /shipments/order/:orderId — owner (or the guest session that placed it) only. */
export async function listOrderShipments(user, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      guestSessionId: true,
      shipments: { include: eventsInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
  assertOrderAccess(user, order);
  return { items: order.shipments.map(serializeShipment) };
}

const ADVANCEABLE_ORDER_STATUS = {
  FORWARD: ['CONFIRMED', 'SHIPPED'],
  RETURN: ['RETURN_REQUESTED'],
};

/**
 * POST /admin/shipments/:id/advance — demo simulator. Moves the shipment one step, records an event and
 * syncs the order: forward SHIPPED/DELIVERED, return DELIVERED → RETURNED (restock + refund).
 */
export async function advanceShipment(shipmentId, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({ where: { id: shipmentId }, include: { order: true } });
    if (!shipment) throw notFound('Shipment not found');

    const next = NEXT_STATUS[shipment.status];
    if (!next) throw conflict('This shipment has already been delivered', 'SHIPMENT_DELIVERED');
    if (!ADVANCEABLE_ORDER_STATUS[shipment.type].includes(shipment.order.status)) {
      throw conflict(`Order is ${shipment.order.status.toLowerCase()}; its shipment cannot move`, 'ORDER_NOT_SHIPPABLE');
    }

    const delivered = next === 'DELIVERED';
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status: next,
        ...(delivered && { actualDelivery: now }),
        events: { create: { status: next, note: shipmentNote(shipment.type, next), occurredAt: now } },
      },
    });

    let orderStatus = shipment.order.status;
    if (shipment.type === 'FORWARD') {
      orderStatus = delivered ? 'DELIVERED' : 'SHIPPED';
      await tx.order.update({ where: { id: shipment.orderId }, data: { status: orderStatus } });
      if (delivered) await tx.orderItem.updateMany({ where: { orderId: shipment.orderId }, data: { deliveryDate: now } });
    } else if (delivered) {
      orderStatus = 'RETURNED';
      await completeReturn(tx, shipment.orderId, now);
    }

    const updated = await tx.shipment.findUnique({ where: { id: shipment.id }, include: eventsInclude });
    return { shipment: serializeShipment(updated), orderStatus };
  });
}
