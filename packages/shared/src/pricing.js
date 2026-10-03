import {
  DELIVERY_CHARGE_PAISE,
  FREE_DELIVERY_THRESHOLD_PAISE,
  GIFT_POINT_EARN_RATE,
  GIFT_POINT_VALUE_PAISE,
  TAX_RATE,
} from './constants.js';

/**
 * Discount for a coupon against a subtotal. Returns 0 when the minimum order value is not met.
 * coupon: { discountType: 'FLAT'|'PERCENT', discountValue, maxDiscountPaise?, minOrderValuePaise? }
 */
export function computeCouponDiscount(subtotalPaise, coupon) {
  if (!coupon || subtotalPaise <= 0) return 0;
  if (subtotalPaise < (coupon.minOrderValuePaise ?? 0)) return 0;

  let discount =
    coupon.discountType === 'PERCENT'
      ? Math.round((subtotalPaise * coupon.discountValue) / 100)
      : coupon.discountValue;

  if (coupon.maxDiscountPaise != null) discount = Math.min(discount, coupon.maxDiscountPaise);
  return Math.max(0, Math.min(discount, subtotalPaise));
}

/**
 * Single source of truth for order totals (backend checkout + frontend preview).
 * Tax is charged on the pre-discount subtotal, matching the checkout design.
 */
export function computeOrderTotals({ items = [], coupon = null, giftPointsToRedeem = 0 } = {}) {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalPaise = items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);
  const taxPaise = Math.round(subtotalPaise * TAX_RATE);

  const allDigital = items.length > 0 && items.every((item) => item.format === 'EBOOK');
  const deliveryChargePaise =
    items.length === 0 || allDigital || subtotalPaise >= FREE_DELIVERY_THRESHOLD_PAISE
      ? 0
      : DELIVERY_CHARGE_PAISE;

  const couponDiscountPaise = computeCouponDiscount(subtotalPaise, coupon);

  const payableBeforeGift = subtotalPaise + taxPaise + deliveryChargePaise - couponDiscountPaise;
  const requestedPoints = Math.max(0, Math.floor(giftPointsToRedeem));
  const giftPointsRedeemed = Math.min(
    requestedPoints,
    Math.floor(payableBeforeGift / GIFT_POINT_VALUE_PAISE),
  );
  const giftDiscountPaise = giftPointsRedeemed * GIFT_POINT_VALUE_PAISE;

  const totalPaise = payableBeforeGift - giftDiscountPaise;
  const pointsEarned = Math.floor((totalPaise * GIFT_POINT_EARN_RATE) / GIFT_POINT_VALUE_PAISE);

  return {
    itemCount,
    subtotalPaise,
    taxPaise,
    deliveryChargePaise,
    couponDiscountPaise,
    giftPointsRedeemed,
    giftDiscountPaise,
    totalPaise,
    pointsEarned,
  };
}
