import * as coupons from './coupons.service.js';

export async function validateCoupon(req, res) {
  res.json(await coupons.validateCoupon(req.body));
}
