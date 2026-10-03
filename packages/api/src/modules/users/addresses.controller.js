import * as addresses from './addresses.service.js';

export async function list(req, res) {
  res.json({ items: await addresses.listAddresses(req.user.id) });
}

export async function create(req, res) {
  res.status(201).json(await addresses.createAddress(req.user.id, req.body));
}

export async function update(req, res) {
  res.json(await addresses.updateAddress(req.user.id, req.params.addressId, req.body));
}

export async function remove(req, res) {
  await addresses.deleteAddress(req.user.id, req.params.addressId);
  res.status(204).end();
}

export async function setDefault(req, res) {
  res.json(await addresses.setDefaultAddress(req.user.id, req.params.addressId));
}
