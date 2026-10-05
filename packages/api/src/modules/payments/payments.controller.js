import * as payments from './payments.service.js';

export async function initiatePayment(req, res) {
  res.json(await payments.initiatePayment(req.user, req.body));
}

export async function confirmPayment(req, res) {
  res.json(await payments.confirmPayment(req.user, req.body));
}

export async function getWallet(req, res) {
  res.json(await payments.getWallet(req.user.id));
}
