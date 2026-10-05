import { readFileSync } from 'node:fs';
import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';
import { stableId } from '../prisma/seed/ids.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { TEST_ADDRESS, createUser } from './factories.js';

const app = createApp();
const collection = JSON.parse(readFileSync(new URL('../../../docs/insomnia/bookworm.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(collection.resources.map((resource) => [resource._id, resource]));
const env = {
  ...collection.resources.find((resource) => resource._type === 'environment').data,
  // Use books whose sales counts other suites don't assert on.
  book_id: stableId('book', 'rain-on-tin-roofs'),
  book2_id: stableId('book', 'a-life-in-colour'),
};

const RESPONSE_TAG = /\{% response 'body', '(\w+)', 'b64::([^:]+)::46b'/;
const captured = {};

function variable(name) {
  const value = env[name];
  if (typeof value === 'string' && RESPONSE_TAG.test(value)) {
    if (!(name in captured)) throw new Error(`${name} has not been captured yet`);
    return captured[name];
  }
  return value;
}

const render = (text) => text?.replace(/\{\{ _\.(\w+) \}\}/g, (_match, name) => variable(name));

/** Minimal JSONPath for "$.a.b[0].c". */
function readPath(body, path) {
  return path
    .replace(/^\$\./, '')
    .split(/\.|\[(\d+)\]/)
    .filter(Boolean)
    .reduce((value, key) => value?.[key], body);
}

/** Sends one collection request through supertest and captures any variables chained from it. */
async function run(requestId) {
  const spec = byId[requestId];
  const url = new URL(render(spec.url));
  for (const { name, value } of spec.parameters ?? []) url.searchParams.set(name, render(value));

  let call = request(app)[spec.method.toLowerCase()](url.pathname + url.search);
  for (const { name, value } of spec.headers ?? []) call = call.set(name, render(value));
  if (spec.authentication?.type === 'bearer') call = call.set('Authorization', `Bearer ${render(spec.authentication.token)}`);
  const res = await (spec.body?.text ? call.send(JSON.parse(render(spec.body.text))) : call);

  for (const [name, value] of Object.entries(env)) {
    const match = typeof value === 'string' && value.match(RESPONSE_TAG);
    if (match && match[1] === requestId) {
      captured[name] = readPath(res.body, Buffer.from(match[2], 'base64').toString('utf8'));
    }
  }
  return res;
}

// Replay as a fresh customer so the seeded customer's follows, points and cart stay untouched.
beforeAll(async () => {
  const { user, email, password } = await createUser();
  const address = await prisma.address.create({ data: { userId: user.id, ...TEST_ADDRESS, country: 'India', isDefault: true } });
  Object.assign(env, { email, password, address_id: address.id });
});

describe('Insomnia collection', () => {
  test('every request belongs to a folder and uses the base_url variable', () => {
    const requests = collection.resources.filter((resource) => resource._type === 'request');
    expect(requests.length).toBeGreaterThan(30);
    for (const req of requests) {
      expect(byId[req.parentId]?._type).toBe('request_group');
      expect(req.url.startsWith('{{ _.base_url }}')).toBe(true);
    }
  });

  test('login → cart → checkout → pay → track → admin advance runs end to end', async () => {
    expect((await run('req_login')).status).toBe(200);
    expect((await run('req_cart_add')).status).toBe(200);
    expect((await run('req_cart_add2')).status).toBe(200);

    const checkout = await run('req_checkout');
    expect(checkout.status).toBe(201);
    expect(checkout.body.order.couponCode).toBe('BOOK10');

    expect((await run('req_pay_initiate')).status).toBe(200);
    const confirm = await run('req_pay_confirm');
    expect(confirm.body).toMatchObject({ success: true, order: { status: 'CONFIRMED' } });

    expect((await run('req_order')).body.paymentStatus).toBe('PAID');
    expect((await run('req_tracking')).body.items).toHaveLength(1);

    expect((await run('req_admin_login')).status).toBe(200);
    expect((await run('req_admin_advance')).body.orderStatus).toBe('SHIPPED');
    expect((await run('req_cancel')).status).toBe(409);
  });

  test('read-only requests all succeed', async () => {
    for (const id of ['req_health', 'req_categories', 'req_publishers', 'req_books', 'req_search', 'req_book',
      'req_recommended', 'req_bestsellers', 'req_new', 'req_authors', 'req_following', 'req_store', 'req_wallet',
      'req_rate', 'req_orders', 'req_lookup', 'req_coupon', 'req_admin_orders', 'req_admin_books', 'req_profile',
      'req_addresses', 'req_wishlist']) {
      const res = await run(id);
      expect(res.status, id).toBe(200);
    }
  });
});
