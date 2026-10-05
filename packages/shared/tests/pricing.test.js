import { describe, expect, test } from 'vitest';
import { computeCouponDiscount, computeOrderTotals } from '../src/index.js';

const BOOK10 = { discountType: 'FLAT', discountValue: 10000, minOrderValuePaise: 30000 };
const SAVE20 = {
  discountType: 'PERCENT',
  discountValue: 20,
  minOrderValuePaise: 50000,
  maxDiscountPaise: 20000,
};

const joyOfMinimalism = { pricePaise: 14900, quantity: 1, format: 'PAPERBACK' };
const pathToSuccess = { pricePaise: 35900, quantity: 1, format: 'PAPERBACK' };

describe('computeOrderTotals', () => {
  test('design cart with BOOK10', () => {
    const totals = computeOrderTotals({ items: [joyOfMinimalism, pathToSuccess], coupon: BOOK10 });
    expect(totals).toMatchObject({
      itemCount: 2,
      subtotalPaise: 50800,
      taxPaise: 6096,
      deliveryChargePaise: 0,
      couponDiscountPaise: 10000,
      giftDiscountPaise: 0,
      totalPaise: 46896,
      pointsEarned: 23,
    });
  });

  test('charges delivery under the free threshold', () => {
    const totals = computeOrderTotals({ items: [joyOfMinimalism] });
    expect(totals.deliveryChargePaise).toBe(4900);
    expect(totals.totalPaise).toBe(14900 + 1788 + 4900);
  });

  test('eBook-only orders have no delivery charge', () => {
    const totals = computeOrderTotals({
      items: [{ pricePaise: 9900, quantity: 1, format: 'EBOOK' }],
    });
    expect(totals.deliveryChargePaise).toBe(0);
  });

  test('mixed eBook and print orders under threshold pay delivery', () => {
    const totals = computeOrderTotals({
      items: [{ pricePaise: 9900, quantity: 1, format: 'EBOOK' }, joyOfMinimalism],
    });
    expect(totals.deliveryChargePaise).toBe(4900);
  });

  test('multiplies price by quantity', () => {
    const totals = computeOrderTotals({ items: [{ ...joyOfMinimalism, quantity: 3 }] });
    expect(totals.itemCount).toBe(3);
    expect(totals.subtotalPaise).toBe(44700);
  });

  test('gift points are capped at the payable amount', () => {
    const totals = computeOrderTotals({ items: [joyOfMinimalism], giftPointsToRedeem: 1000 });
    const payable = 14900 + 1788 + 4900;
    expect(totals.giftPointsRedeemed).toBe(Math.floor(payable / 100));
    expect(totals.totalPaise).toBe(payable % 100);
  });

  test('redeems requested gift points when payable allows', () => {
    const totals = computeOrderTotals({
      items: [joyOfMinimalism, pathToSuccess],
      coupon: BOOK10,
      giftPointsToRedeem: 200,
    });
    expect(totals.giftPointsRedeemed).toBe(200);
    expect(totals.giftDiscountPaise).toBe(20000);
    expect(totals.totalPaise).toBe(26896);
  });

  test('empty cart totals are zero', () => {
    expect(computeOrderTotals({ items: [] })).toMatchObject({
      subtotalPaise: 0,
      deliveryChargePaise: 0,
      totalPaise: 0,
    });
  });
});

describe('computeCouponDiscount', () => {
  test('percent coupon is capped by maxDiscountPaise', () => {
    expect(computeCouponDiscount(150000, SAVE20)).toBe(20000);
  });

  test('percent coupon below cap', () => {
    expect(computeCouponDiscount(60000, SAVE20)).toBe(12000);
  });

  test('returns 0 when minimum order value is not met', () => {
    expect(computeCouponDiscount(20000, BOOK10)).toBe(0);
  });

  test('flat coupon never exceeds subtotal', () => {
    expect(computeCouponDiscount(3000, { discountType: 'FLAT', discountValue: 5000 })).toBe(3000);
  });

  test('no coupon returns 0', () => {
    expect(computeCouponDiscount(50000, null)).toBe(0);
  });
});
