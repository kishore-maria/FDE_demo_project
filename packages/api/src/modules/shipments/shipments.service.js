import { DELIVERY_BUSINESS_DAYS, addBusinessDays, generateTrackingNumber } from 'bookworm-shared';

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
