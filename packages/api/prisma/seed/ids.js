import { createHash } from 'node:crypto';

/**
 * Deterministic UUID (v5-style) from a kind + natural key, e.g. stableId('book', 'joy-of-minimalism').
 * Keeps seed ids identical across machines so upserts stay idempotent and docs/tests can reference them.
 */
export function stableId(kind, key) {
  const hex = createHash('sha1').update(`bookworm:${kind}:${key}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
