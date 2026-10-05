import {
  DELIVERY_CHARGE_PAISE,
  DELIVERY_ZONES,
  FREE_DELIVERY_THRESHOLD_PAISE,
  addBusinessDays,
  estimateDelivery,
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

/** Latest promised delivery date for a PIN; unknown PINs (legacy data) fall back to the slowest national estimate. */
export function committedDeliveryDate(pin, now = new Date()) {
  return estimateDelivery({ pin, now }).latest ?? addBusinessDays(now, DELIVERY_ZONES.NATIONAL.maxDays);
}

/**
 * Creates a shipment with its first tracking event. eBook-only forward shipments are delivered
 * instantly (digital download); everything else starts in PROCESSING with a PIN-based estimate.
 */
export async function createShipment(
  tx,
  { orderId, type = 'FORWARD', shippingRatePaise = 0, digitalOnly = false, pin = null, now = new Date() },
) {
  const instant = type === 'FORWARD' && digitalOnly;
  const estimatedDelivery = instant ? now : committedDeliveryDate(pin, now);
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

/** POST /shipments/calculate-rate — same charge rules as computeOrderTotals, plus the PIN-based estimate. */
export function calculateRate({ subtotalPaise, allDigital = false, pin = null }, now = new Date()) {
  const free = allDigital || subtotalPaise >= FREE_DELIVERY_THRESHOLD_PAISE;
  const shippingRatePaise = free ? 0 : DELIVERY_CHARGE_PAISE;
  const estimate = estimateDelivery({ pin, digital: allDigital, now });
  return {
    shippingRatePaise,
    shippingRateInr: formatINR(shippingRatePaise),
    freeShippingEligible: free,
    serviceable: estimate.serviceable,
    zone: estimate.zone,
    estimatedDeliveryEarliest: estimate.earliest,
    estimatedDelivery: estimate.latest,
    estimatedDeliveryText: estimate.text,
    dispatchCutoffAt: estimate.cutoffAt,
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
