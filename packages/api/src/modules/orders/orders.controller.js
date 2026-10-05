import { checkout } from './checkout.service.js';
import * as orders from './orders.service.js';

export async function checkoutOrder(req, res) {
  res.status(201).json(await checkout(req.user, req.body));
}

export async function listOrders(req, res) {
  res.json(await orders.listOrders(req.user.id, req.query));
}

export async function getOrder(req, res) {
  res.json(await orders.getOrder(req.user, req.params.orderId));
}

export async function lookupOrder(req, res) {
  res.json(await orders.lookupOrder(req.body));
}

export async function verifyOrderAccess(req, res) {
  res.json(await orders.verifyOrderAccess(req.body));
}

export async function cancelOrder(req, res) {
  res.json(await orders.cancelOrder(req.user, req.params.orderId));
}

export async function returnOrder(req, res) {
  res.json(await orders.returnOrder(req.user, req.params.orderId));
}

export async function updateOrderAddress(req, res) {
  res.json(await orders.updateOrderAddress(req.user, req.params.orderId, req.body));
}
