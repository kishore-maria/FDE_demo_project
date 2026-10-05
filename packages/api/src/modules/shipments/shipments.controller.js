import * as shipments from './shipments.service.js';

export async function listOrderShipments(req, res) {
  res.json(await shipments.listOrderShipments(req.user, req.params.orderId));
}

export function calculateRate(req, res) {
  res.json(shipments.calculateRate(req.body));
}

export async function advanceShipment(req, res) {
  res.json(await shipments.advanceShipment(req.params.shipmentId));
}
