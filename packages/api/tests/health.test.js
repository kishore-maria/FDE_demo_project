import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { conflict } from '../src/lib/errors.js';

const app = createApp();

describe('GET /api/health', () => {
  test('returns ok with version and timestamp (response validated against the spec)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: '1.0.0' });
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  test('sets security headers and hides Express', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('allows the web app origin via CORS', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('does not allow other origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('error handling', () => {
  test('unknown route returns 404 in the standard error shape', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  test('route outside /api returns 404 JSON', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('documented route without a handler yet returns 404', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(404);
  });

  test('invalid uuid path parameter returns 400 VALIDATION_ERROR (never 500)', async () => {
    const res = await request(app).get('/api/books/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toMatch(/bookId/);
  });

  test('invalid request body returns 400 with details', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  test('unexpected fields in a request body are rejected', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@test.com', password: 'Test@1234', role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  test('malformed JSON returns 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('unsupported method on a documented path returns 405', async () => {
    const res = await request(app).patch('/api/health');
    expect(res.status).toBe(405);
    expect(res.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  test('swagger docs and raw spec are served', async () => {
    const docs = await request(app).get('/api/docs/');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('BookWorm API');
    const spec = await request(app).get('/api/docs/openapi.json');
    expect(spec.body.info.title).toBe('BookWorm API');
  });
});

describe('handler errors', () => {
  const appWithTestRoutes = createApp({
    registerTestRoutes(router) {
      router.post('/auth/register', () => {
        throw conflict('Email already in use', 'EMAIL_IN_USE');
      });
      router.post('/auth/login', async () => {
        throw new Error('database exploded: secret details');
      });
      router.get('/categories', (req, res) => res.json({ wrong: true }));
    },
  });

  test('AppError is rendered with its status and code', async () => {
    const res = await request(appWithTestRoutes)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'Test@1234', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'EMAIL_IN_USE', message: 'Email already in use' } });
  });

  test('unexpected async errors become a generic 500 without leaking details', async () => {
    const res = await request(appWithTestRoutes)
      .post('/api/auth/login')
      .send({ email: 'customer@test.com', password: 'Test@1234' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  test('responses that do not match the spec fail loudly in tests', async () => {
    const res = await request(appWithTestRoutes).get('/api/categories');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('RESPONSE_VALIDATION_ERROR');
  });
});
