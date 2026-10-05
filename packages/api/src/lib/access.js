import { notFound } from './errors.js';

/**
 * Ensures `user` may access `order`. Registered users must own it; guests must own it AND have
 * placed it in their current guest session (order.guestSessionId === user.gsid), or hold an
 * order-scoped token for exactly this order (user.orderId).
 * Fails with 404 rather than 403 so order ids can't be probed.
 */
export function assertOrderAccess(user, order) {
  const owns = order && user && order.userId === user.id;
  const sessionMatches = user?.orderId
    ? order?.id === user.orderId
    : user?.role !== 'GUEST' || (user.gsid && order?.guestSessionId === user.gsid);
  if (!owns || !sessionMatches) throw notFound('Order not found');
  return order;
}
