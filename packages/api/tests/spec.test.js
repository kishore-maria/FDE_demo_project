import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';

const specPath = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Every endpoint from PLAN.md Section 7 (Endpoint Inventory).
const REQUIRED_OPERATIONS = [
  'GET /health',
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/guest-session',
  'GET /auth/profile',
  'PUT /auth/profile',
  'PUT /auth/set-password',
  'GET /users/me/addresses',
  'POST /users/me/addresses',
  'PUT /users/me/addresses/{addressId}',
  'DELETE /users/me/addresses/{addressId}',
  'PUT /users/me/addresses/{addressId}/default',
  'GET /categories',
  'GET /publishers',
  'GET /publishers/{publisherId}',
  'GET /books',
  'GET /books/recommended',
  'GET /books/bestsellers',
  'GET /books/new-launches',
  'GET /books/{bookId}',
  'POST /books/{bookId}/reviews',
  'GET /authors',
  'GET /authors/{authorId}',
  'GET /authors/following',
  'GET /authors/following/new-releases',
  'GET /authors/suggestions',
  'POST /authors/{authorId}/follow',
  'DELETE /authors/{authorId}/follow',
  'GET /cart',
  'DELETE /cart',
  'POST /cart/items',
  'PUT /cart/items/{bookId}',
  'DELETE /cart/items/{bookId}',
  'POST /cart/merge',
  'POST /cart/buy-again/{orderId}',
  'GET /wishlist',
  'POST /wishlist',
  'DELETE /wishlist/{bookId}',
  'POST /coupons/validate',
  'POST /orders/checkout',
  'GET /orders',
  'GET /orders/{orderId}',
  'POST /orders/{orderId}/cancel',
  'POST /orders/{orderId}/return',
  'PATCH /orders/{orderId}/address',
  'POST /orders/lookup',
  'POST /orders/lookup/verify',
  'POST /payments/initiate',
  'POST /payments/confirm',
  'GET /payments/wallet',
  'GET /shipments/order/{orderId}',
  'POST /shipments/calculate-rate',
  'GET /stores/{slug}',
  'GET /admin/books',
  'POST /admin/books',
  'PUT /admin/books/{bookId}',
  'DELETE /admin/books/{bookId}',
  'GET /admin/categories',
  'POST /admin/categories',
  'PUT /admin/categories/{categoryId}',
  'DELETE /admin/categories/{categoryId}',
  'GET /admin/publishers',
  'POST /admin/publishers',
  'GET /admin/authors',
  'POST /admin/authors',
  'GET /admin/coupons',
  'POST /admin/coupons',
  'GET /admin/stores',
  'POST /admin/stores',
  'GET /admin/stores/{storeId}/policies',
  'POST /admin/stores/{storeId}/policies',
  'GET /admin/orders',
  'POST /admin/shipments/{shipmentId}/advance',
];

const PUBLIC_OPERATIONS = [
  'GET /health',
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/guest-session',
  'GET /categories',
  'GET /publishers',
  'GET /publishers/{publisherId}',
  'GET /books/bestsellers',
  'GET /books/new-launches',
  'POST /orders/lookup',
  'POST /orders/lookup/verify',
  'POST /shipments/calculate-rate',
  'GET /stores/{slug}',
];

const OPTIONAL_AUTH_OPERATIONS = [
  'GET /books',
  'GET /books/recommended',
  'GET /books/{bookId}',
  'GET /authors',
  'GET /authors/{authorId}',
];

let api;
let operations;

beforeAll(async () => {
  api = await SwaggerParser.validate(specPath);
  operations = new Map(
    Object.entries(api.paths).flatMap(([path, item]) =>
      METHODS.filter((m) => item[m]).map((m) => [`${m.toUpperCase()} ${path}`, item[m]]),
    ),
  );
});

describe('OpenAPI spec', () => {
  test('is valid OpenAPI 3.0 with BearerAuth as the default security', () => {
    expect(api.openapi).toMatch(/^3\.0\./);
    expect(api.components.securitySchemes.BearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(api.security).toEqual([{ BearerAuth: [] }]);
  });

  test('documents every endpoint from the plan', () => {
    const missing = REQUIRED_OPERATIONS.filter((op) => !operations.has(op));
    expect(missing).toEqual([]);
  });

  test('every operation has a unique operationId, a tag, a summary and a success response', () => {
    const ids = new Set();
    for (const [name, op] of operations) {
      expect(op.operationId, name).toBeTruthy();
      expect(ids.has(op.operationId), `duplicate operationId ${op.operationId}`).toBe(false);
      ids.add(op.operationId);
      expect(op.tags?.length, name).toBeGreaterThan(0);
      expect(op.summary, name).toBeTruthy();
      expect(Object.keys(op.responses).some((code) => /^2\d\d$/.test(code)), name).toBe(true);
    }
  });

  test.each(PUBLIC_OPERATIONS)('%s is public (security: [])', (name) => {
    expect(operations.get(name).security).toEqual([]);
  });

  test.each(OPTIONAL_AUTH_OPERATIONS)('%s accepts an optional token', (name) => {
    expect(operations.get(name).security).toEqual([{}, { BearerAuth: [] }]);
  });

  test('all other operations require a bearer token', () => {
    const open = new Set([...PUBLIC_OPERATIONS, ...OPTIONAL_AUTH_OPERATIONS]);
    for (const [name, op] of operations) {
      if (!open.has(name)) expect(op.security, name).toBeUndefined();
    }
  });

  test('admin endpoints are tagged Admin', () => {
    for (const [name, op] of operations) {
      if (name.includes(' /admin/')) expect(op.tags, name).toEqual(['Admin']);
    }
  });

  test('examples use real seed data', () => {
    const { schemas } = api.components;
    expect(schemas.LoginRequest.example).toEqual({ email: 'customer@test.com', password: 'Test@1234' });
    expect(schemas.BookSummary.example).toMatchObject({ title: 'Joy of Minimalism', pricePaise: 14900, priceInr: '₹149' });
    expect(schemas.OrderLookupRequest.example.orderNumber).toBe('BW-SEED000B');
  });

  test('path ids are validated as uuids', () => {
    for (const name of ['BookId', 'OrderId', 'AuthorId', 'AddressId']) {
      expect(api.components.parameters[name].schema).toEqual({ type: 'string', format: 'uuid' });
    }
  });
});

describe('express-openapi-validator compatibility', () => {
  const app = express();
  app.use(express.json());
  app.use(
    OpenApiValidator.middleware({
      apiSpec: specPath,
      validateRequests: true,
      validateResponses: true,
      validateSecurity: false,
    }),
  );
  app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));
  app.get('/api/books/:bookId', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Book not found' } }));
  app.post('/api/auth/login', (req, res) => res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }));
  app.use((err, req, res, next) => res.status(err.status ?? 500).json({ error: { code: 'VALIDATION_ERROR', message: err.message } }));

  test('the spec compiles and a valid response passes', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  test('an invalid uuid path parameter is rejected with 400', async () => {
    const res = await request(app).get('/api/books/not-a-uuid');
    expect(res.status).toBe(400);
  });

  test('a valid uuid reaches the handler', async () => {
    const res = await request(app).get('/api/books/3655c0fb-15c6-56a2-a40d-e0636592fb83');
    expect(res.status).toBe(404);
  });

  test('request bodies are validated', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('a well-formed request body passes validation', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'customer@test.com', password: 'x' });
    expect(res.status).toBe(401);
  });
});
