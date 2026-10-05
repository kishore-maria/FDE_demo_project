import { computeCouponDiscount, formatINR } from 'bookworm-shared';
import { prisma } from '../../lib/prisma.js';

export const normalizeCode = (code) => code.trim().toUpperCase();

function rejection(coupon, subtotalPaise, now) {
  if (!coupon) return { reason: 'NOT_FOUND', message: 'This coupon code does not exist' };
  if (!coupon.isActive) return { reason: 'INACTIVE', message: `Coupon ${coupon.code} is no longer active` };
  if (coupon.validUntil < now) return { reason: 'EXPIRED', message: `Coupon ${coupon.code} has expired` };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { reason: 'USAGE_LIMIT_REACHED', message: `Coupon ${coupon.code} has reached its usage limit` };
  }
  if (subtotalPaise < coupon.minOrderValuePaise) {
    return {
      reason: 'MIN_ORDER_NOT_MET',
      message: `Coupon ${coupon.code} needs a minimum order of ${formatINR(coupon.minOrderValuePaise)}`,
    };
  }
  return null;
}

/**
 * Looks up a coupon and checks it against a subtotal without consuming it.
 * Shared by POST /coupons/validate and checkout (pass `db` to run inside a transaction).
 */
export async function checkCoupon(code, subtotalPaise, { now = new Date(), db = prisma } = {}) {
  const normalized = normalizeCode(code);
  const coupon = await db.coupon.findUnique({ where: { code: normalized } });
  const rejected = rejection(coupon, subtotalPaise, now);
  return {
    code: normalized,
    coupon: rejected ? null : coupon,
    reason: rejected?.reason ?? null,
    message: rejected?.message ?? null,
    discountPaise: rejected ? 0 : computeCouponDiscount(subtotalPaise, coupon),
  };
}

export async function validateCoupon({ code, subtotalPaise }) {
  const result = await checkCoupon(code, subtotalPaise);
  return {
    valid: result.reason === null,
    code: result.code,
    discountPaise: result.discountPaise,
    discountInr: formatINR(result.discountPaise),
    reason: result.reason,
    message: result.message,
  };
}
