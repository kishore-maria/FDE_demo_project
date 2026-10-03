import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { authHeader, createUser, loginAs, tokenFor } from './factories.js';

const app = createApp();

const address = (overrides = {}) => ({
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.com',
  phone: '9876543210',
  line1: '12 Brigade Road',
  line2: 'Flat 4B',
  city: 'Bengaluru',
  pin: '560025',
  state: 'Karnataka',
  ...overrides,
});

let auth;
const api = {
  list: () => request(app).get('/api/users/me/addresses').set(auth),
  create: (body) => request(app).post('/api/users/me/addresses').set(auth).send(body),
  update: (id, body) => request(app).put(`/api/users/me/addresses/${id}`).set(auth).send(body),
  remove: (id) => request(app).delete(`/api/users/me/addresses/${id}`).set(auth),
  makeDefault: (id) => request(app).put(`/api/users/me/addresses/${id}/default`).set(auth),
};

beforeEach(async () => {
  const { user } = await createUser();
  auth = authHeader(tokenFor(user));
});

describe('addresses', () => {
  test('a new user has no addresses', async () => {
    const res = await api.list();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  test('the first saved address becomes the default; later ones do not', async () => {
    const first = await api.create(address());
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ ...address(), country: 'India', isDefault: true });

    const second = await api.create(address({ line1: '7 MG Road', line2: undefined }));
    expect(second.body).toMatchObject({ isDefault: false, line2: null });
  });

  test('list returns the default first', async () => {
    const first = await api.create(address());
    await api.create(address({ line1: 'Second' }));
    const res = await api.list();
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].id).toBe(first.body.id);
  });

  test('setting a new default clears the previous one', async () => {
    const first = await api.create(address());
    const second = await api.create(address({ line1: 'Second' }));

    const res = await api.makeDefault(second.body.id);
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);

    const { body } = await api.list();
    expect(body.items.filter((a) => a.isDefault).map((a) => a.id)).toEqual([second.body.id]);
    expect(body.items.find((a) => a.id === first.body.id).isDefault).toBe(false);
  });

  test('updates an address', async () => {
    const created = await api.create(address());
    const res = await api.update(created.body.id, address({ city: 'Mysuru', pin: '570001' }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ city: 'Mysuru', pin: '570001', isDefault: true });
  });

  test('deleting the default promotes the most recent remaining address', async () => {
    const first = await api.create(address());
    await api.create(address({ line1: 'Second' }));
    const third = await api.create(address({ line1: 'Third' }));

    expect((await api.remove(first.body.id)).status).toBe(204);
    const { body } = await api.list();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ id: third.body.id, isDefault: true });
  });

  test.each([
    ['6-digit pin', { pin: '5600' }],
    ['10-digit phone', { phone: '+91987654' }],
    ['valid email', { email: 'nope' }],
    ['required city', { city: undefined }],
  ])('validates %s', async (_label, overrides) => {
    const res = await api.create(address(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test("another user's address returns 404 for every operation", async () => {
    const other = await api.create(address());
    const { user } = await createUser();
    auth = authHeader(tokenFor(user));

    expect((await api.update(other.body.id, address())).status).toBe(404);
    expect((await api.makeDefault(other.body.id)).status).toBe(404);
    expect((await api.remove(other.body.id)).status).toBe(404);
    expect((await api.list()).body.items).toEqual([]);
  });

  test('unknown address id returns 404; malformed id returns 400', async () => {
    expect((await api.remove('2c1a0b7e-1111-4222-8333-444455556666')).status).toBe(404);
    expect((await api.remove('not-a-uuid')).status).toBe(400);
  });
});

describe('address access control', () => {
  test('requires a token', async () => {
    expect((await request(app).get('/api/users/me/addresses')).status).toBe(401);
  });

  test('guests get 403', async () => {
    const { user } = await createUser({ role: 'GUEST' });
    const res = await request(app)
      .get('/api/users/me/addresses')
      .set(authHeader(tokenFor(user, { gsid: 'g' })));
    expect(res.status).toBe(403);
  });

  test("seeded customer sees their default Bengaluru address", async () => {
    const token = await loginAs(app, 'customer@test.com');
    const res = await request(app).get('/api/users/me/addresses').set(authHeader(token));
    expect(res.body.items[0]).toMatchObject({ city: 'Bengaluru', isDefault: true });
  });
});
