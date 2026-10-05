import { checkout } from './checkout.service.js';

export async function checkoutOrder(req, res) {
  res.status(201).json(await checkout(req.user, req.body));
}
