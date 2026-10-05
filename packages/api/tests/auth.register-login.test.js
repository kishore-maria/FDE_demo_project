import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { createUser } from './factories.js';

const app = createApp();
const uniqueEmail = () => `reader-${randomUUID()}@example.com`;
const newReader = (overrides = {}) => ({
  email: uniqueEmail(),
  password: 'Reader@123',
  firstName: 'Asha',
  lastName: 'Rao',
  ...overrides,
});

describe('POST /api/auth/register', () => {
  test('creates a customer and returns a 7-day token', async () => {
    const body = newReader({ email: uniqueEmail().toUpperCase() });
    const res = await request(app).post('/api/auth/register').send(body);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: body.email.toLowerCase(),
      firstName: 'Asha',
      lastName: 'Rao',
      role: 'CUSTOMER',
      giftPoints: 0,
      walletBalancePaise: 0,
      walletBalanceInr: '₹0',
    });

    const claims = jwt.decode(res.body.token);
    expect(claims).toMatchObject({
      sub: res.body.user.id,
      email: body.email.toLowerCase(),
      role: 'CUSTOMER',
      firstName: 'Asha',
      lastName: 'Rao',
    });
    expect(claims.exp - claims.iat).toBe(7 * 24 * 60 * 60);
  });

  test('never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/register').send(newReader());
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  test('duplicate email (case-insensitive) returns 409 EMAIL_IN_USE', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send(newReader({ email }));
    const res = await request(app).post('/api/auth/register').send(newReader({ email: email.toUpperCase() }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_IN_USE');
  });

  test("a guest's email cannot be taken over by registering", async () => {
    const { email } = await createUser({ role: 'GUEST' });
    const res = await request(app).post('/api/auth/register').send(newReader({ email }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GUEST_ACCOUNT');
  });

  test.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'reader@123'],
    ['no number', 'Reader@abc'],
  ])('weak password (%s) returns 400', async (_label, password) => {
    const res = await request(app).post('/api/auth/register').send(newReader({ password }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('missing lastName returns 400', async () => {
    const { lastName: _omit, ...body } = newReader();
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
  });

  test('role cannot be injected', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...newReader(), role: 'ADMIN' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('seeded customer can log in and sees their gift points', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@test.com', password: 'Test@1234' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'customer@test.com', role: 'CUSTOMER', giftPoints: 200 });
  });

  test('email is case-insensitive', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'Customer@Test.com', password: 'Test@1234' });
    expect(res.status).toBe(200);
  });

  test('admin gets an ADMIN token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@bookworm.com', password: 'Admin@1234' });
    expect(jwt.decode(res.body.token).role).toBe('ADMIN');
  });

  test.each([
    ['wrong password', 'customer@test.com', 'WrongPass1'],
    ['unknown email', 'nobody@example.com', 'Test@1234'],
  ])('%s returns the same 401 INVALID_CREDENTIALS', async (_label, email, password) => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  });

  test('guest accounts (no password) cannot log in', async () => {
    const { email } = await createUser({ role: 'GUEST' });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'Anything1' });
    expect(res.status).toBe(401);
  });

  test('newly registered user can log in', async () => {
    const body = newReader();
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
    expect(res.status).toBe(200);
  });
});
