/**
 * Undoes a paid order: restocks, gives back redeemed points, reverses earned points, frees the coupon
 * use and refunds the payment (wallet payments go straight back to the wallet). Caller sets order status.
 */
export async function refundOrder(tx, orderId, now = new Date()) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { bookId: true, quantity: true } }, payments: true },
  });

  for (const { bookId, quantity } of order.items) {
    await tx.book.update({ where: { id: bookId }, data: { stockQuantity: { increment: quantity } } });
  }
  if (order.paymentStatus !== 'PAID') return order;

  const pointsTxn = (points, type, reason) =>
    tx.giftPointTransaction.create({ data: { userId: order.userId, orderId: order.id, points, type, reason, createdAt: now } });

  if (order.giftPointsRedeemed > 0) {
    await tx.user.update({ where: { id: order.userId }, data: { giftPoints: { increment: order.giftPointsRedeemed } } });
    await pointsTxn(order.giftPointsRedeemed, 'CREDIT', `Refund of points redeemed on order ${order.orderNumber}`);
  }

  if (order.giftPointsEarned > 0) {
    // Points already spent elsewhere can't be clawed back below zero.
    const { giftPoints } = await tx.user.findUnique({ where: { id: order.userId }, select: { giftPoints: true } });
    const reversed = Math.min(order.giftPointsEarned, giftPoints);
    if (reversed > 0) {
      await tx.user.update({ where: { id: order.userId }, data: { giftPoints: { decrement: reversed } } });
      await pointsTxn(reversed, 'DEBIT', `Reversal of points earned on order ${order.orderNumber}`);
    }
  }

  if (order.couponId) {
    await tx.coupon.updateMany({ where: { id: order.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
  }

  const paid = order.payments.find((payment) => payment.status === 'SUCCEEDED');
  if (paid) {
    await tx.payment.update({ where: { id: paid.id }, data: { status: 'REFUNDED', refundedAt: now } });
    if (paid.method === 'WALLET') {
      await tx.user.update({ where: { id: order.userId }, data: { walletBalancePaise: { increment: paid.amountPaise } } });
    }
  }

  await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'REFUNDED' } });
  return order;
}

/** The return parcel reached the warehouse: refund and mark the order RETURNED. */
export async function completeReturn(tx, orderId, now = new Date()) {
  await refundOrder(tx, orderId, now);
  await tx.order.update({ where: { id: orderId }, data: { status: 'RETURNED' } });
}
