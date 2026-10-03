import * as cart from './cart.service.js';

export async function getCart(req, res) {
  res.json(await cart.getCart(req.user.id));
}

export async function clearCart(req, res) {
  res.json(await cart.clearCart(req.user.id));
}

export async function addItem(req, res) {
  res.json(await cart.addItem(req.user.id, req.body));
}

export async function updateItem(req, res) {
  res.json(await cart.updateItem(req.user.id, req.params.bookId, req.body.quantity));
}

export async function removeItem(req, res) {
  res.json(await cart.removeItem(req.user.id, req.params.bookId));
}

export async function mergeCart(req, res) {
  res.json(await cart.mergeCart(req.user.id, req.body.items));
}

export async function buyAgain(req, res) {
  res.json(await cart.buyAgain(req.user, req.params.orderId));
}
