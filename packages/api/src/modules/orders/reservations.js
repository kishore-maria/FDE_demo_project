/**
 * Ends a PENDING order's stock reservation and puts the reserved copies back on the shelf.
 * The status guard makes this safe to race with payment confirmation: only one side wins.
 * @returns {Promise<boolean>} false when the order was no longer PENDING
 */
export async function releaseReservation(tx, orderId, status, now = new Date()) {
  const { count } = await tx.order.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: { status, ...(status === 'CANCELLED' && { cancelledAt: now }) },
  });
  if (count === 0) return false;

  const items = await tx.orderItem.findMany({ where: { orderId }, select: { bookId: true, quantity: true } });
  for (const { bookId, quantity } of items) {
    await tx.book.update({ where: { id: bookId }, data: { stockQuantity: { increment: quantity } } });
  }
  return true;
}
