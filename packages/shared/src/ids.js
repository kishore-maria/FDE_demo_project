// Crockford base32: no I, L, O, U to avoid misreading when customers type the code.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomCode(length) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  let code = '';
  for (const byte of bytes) code += CROCKFORD[byte & 31];
  return code;
}

/** Human-readable order number, e.g. "BW-7K3F9QXM". */
export function generateOrderNumber() {
  return `BW-${randomCode(8)}`;
}

/** Shipment tracking number, e.g. "TRK-4N8P2D6WQA". */
export function generateTrackingNumber() {
  return `TRK-${randomCode(10)}`;
}
