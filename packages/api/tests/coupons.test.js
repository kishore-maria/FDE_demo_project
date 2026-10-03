import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { computeOrderTotals } from 'bookworm-shared';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { checkCoupon } from '../src/modules/coupons/coupons.service.js';
import { authHeader, createUser, tokenFor } from './factories.js';

const app = createApp();
let headers;
const createdCodes = [];

const validate = (code, subtotalPaise, h = headers) =>
  request(app).post('/api/coupons/validate').set(h).send({ code, subtotalPaise });

async function tempCoupon(overrides) {
  const code = `T${randomBytes(5).toString('hex').toUpperCase()}`;
  createdCodes.push(code);
  return prisma.coupon.create({
    data: {
      code,
      discountType: 'FLAT',
      discountValue: 5000,
      validUntil: new Date(Date.now() + 86_400_000),
      ...overrides,
    },
  });
}

beforeAll(async () => {
  const { user } = await createUser();
  headers = authHeader(tokenFor(user));
});

afterAll(async () => {
  await prisma.coupon.deleteMany({ where: { code: { in: createdCodes } } });
});

describe('POST /api/coupons/validate', () => {
  test('BOOK10 on the ₹508 design cart gives ₹100 off', async () => {
    const res = await validate('BOOK10', 50800);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valid: true,
      code: 'BOOK10',
      discountPaise: 10000,
      discountInr: '₹100',
      reason: null,
      message: null,
    });
  });

  test('SAVE20 on ₹1500 is capped at ₹200', async () => {
    const res = await validate('SAVE20', 150000);
    expect(res.body).toMatchObject({ valid: true, discountPaise: 20000, discountInr: '₹200' });
  });

  test('SAVE20 below the cap gives 20%', async () => {
    const res = await validate('SAVE20', 60000);
    expect(res.body).toMatchObject({ valid: true, discountPaise: 12000 });
  });

  test('EXPIRED10 is invalid with reason EXPIRED', async () => {
    const res = await validate('EXPIRED10', 50800);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: false, code: 'EXPIRED10', discountPaise: 0, discountInr: '₹0', reason: 'EXPIRED' });
    expect(res.body.message).toContain('expired');
  });

  test('BOOK10 on ₹200 is MIN_ORDER_NOT_MET', async () => {
    const res = await validate('BOOK10', 20000);
    expect(res.body).toMatchObject({ valid: false, discountPaise: 0, reason: 'MIN_ORDER_NOT_MET' });
    expect(res.body.message).toContain('₹300');
  });

  test('unknown code is NOT_FOUND', async () => {
    const res = await validate('NOPE123', 50800);
    expect(res.body).toMatchObject({ valid: false, code: 'NOPE123', reason: 'NOT_FOUND' });
  });

  test('codes are trimmed and case-insensitive', async () => {
    const res = await validate('  book10 ', 50800);
    expect(res.body).toMatchObject({ valid: true, code: 'BOOK10', discountPaise: 10000 });
  });

  test('inactive coupon is INACTIVE', async () => {
    const coupon = await tempCoupon({ isActive: false });
    const res = await validate(coupon.code, 50800);
    expect(res.body).toMatchObject({ valid: false, reason: 'INACTIVE' });
  });

  test('used-up coupon is USAGE_LIMIT_REACHED', async () => {
    const coupon = await tempCoupon({ usageLimit: 2, usedCount: 2 });
    const res = await validate(coupon.code, 50800);
    expect(res.body).toMatchObject({ valid: false, reason: 'USAGE_LIMIT_REACHED' });

    const notYet = await tempCoupon({ usageLimit: 2, usedCount: 1 });
    expect((await validate(notYet.code, 50800)).body).toMatchObject({ valid: true, discountPaise: 5000 });
  });

  test('a flat discount never exceeds the subtotal', async () => {
    const res = await validate('WELCOME50', 3000);
    expect(res.body).toMatchObject({ valid: true, discountPaise: 3000 });
  });

  test('guests can validate coupons', async () => {
    const { user } = await createUser({ role: 'GUEST' });
    const res = await validate('BOOK10', 50800, authHeader(tokenFor(user, { gsid: randomUUID() })));
    expect(res.body.valid).toBe(true);
  });

  test('requires a token', async () => {
    const res = await request(app).post('/api/coupons/validate').send({ code: 'BOOK10', subtotalPaise: 50800 });
    expect(res.status).toBe(401);
  });

  test.each([
    ['missing subtotal', { code: 'BOOK10' }],
    ['negative subtotal', { code: 'BOOK10', subtotalPaise: -1 }],
    ['empty code', { code: '', subtotalPaise: 100 }],
    ['unknown field', { code: 'BOOK10', subtotalPaise: 100, userId: 'x' }],
  ])('%s is 400', async (_label, body) => {
    const res = await request(app).post('/api/coupons/validate').set(headers).send(body);
    expect(res.status).toBe(400);
  });
});

describe('pricing integration', () => {
  test('validated discount matches computeOrderTotals for the design cart', async () => {
    const items = [
      { pricePaise: 14900, quantity: 1, format: 'PAPERBACK' },
      { pricePaise: 35900, quantity: 1, format: 'PAPERBACK' },
    ];
    const { coupon, discountPaise } = await checkCoupon('BOOK10', 50800);
    const totals = computeOrderTotals({ items, coupon });

    expect(totals.couponDiscountPaise).toBe(discountPaise);
    expect(totals).toMatchObject({ subtotalPaise: 50800, taxPaise: 6096, deliveryChargePaise: 0, totalPaise: 46896 });
  });

  test('checkCoupon returns no coupon when invalid, so it cannot be applied by mistake', async () => {
    const result = await checkCoupon('EXPIRED10', 50800);
    expect(result).toMatchObject({ coupon: null, reason: 'EXPIRED', discountPaise: 0 });
  });
});
