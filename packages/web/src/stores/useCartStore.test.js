import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { API, server } from '../test/server.js';
import { cartResponse, joy, path, vanishing } from '../test/fixtures.js';
import { signIn, signOut } from '../test/utils.jsx';
import { CART_STORAGE_KEY, cartTotals, selectItemCount, selectSubtotalPaise, useCartStore } from './useCartStore.js';

const cart = () => useCartStore.getState();

beforeEach(signOut);
afterEach(signOut);

describe('local mode (anonymous)', () => {
  test('add, increment, update and remove', async () => {
    await cart().add(joy);
    await cart().add(joy, 2);
    await cart().add(path);
    expect(cart().items.map((i) => [i.book.slug, i.quantity])).toEqual([
      ['joy-of-minimalism', 3],
      ['the-path-to-success', 1],
    ]);

    await cart().update(joy.id, 1);
    expect(selectItemCount(cart())).toBe(2);

    await cart().update(path.id, 0);
    expect(cart().items.map((i) => i.book.slug)).toEqual(['joy-of-minimalism']);

    await cart().remove(joy.id);
    expect(cart().items).toEqual([]);
  });

  test('totals use the shared pricing (design cart = ₹508, free delivery)', async () => {
    await cart().add(joy);
    await cart().add(path);
    expect(selectSubtotalPaise(cart())).toBe(50800);
    expect(cartTotals(cart().items)).toMatchObject({ taxPaise: 6096, deliveryChargePaise: 0, totalPaise: 56896 });
  });

  test('eBook-only carts have free delivery; small paper carts pay ₹49', async () => {
    await cart().add(vanishing);
    expect(cartTotals(cart().items).deliveryChargePaise).toBe(0);
    await cart().add(joy);
    expect(cartTotals(cart().items).deliveryChargePaise).toBe(4900);
  });

  test('persists to localStorage', async () => {
    await cart().add(joy, 2);
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY));
    expect(stored.state).toMatchObject({ mode: 'local', items: [{ quantity: 2, book: { id: joy.id } }] });
  });

  test('quantities are capped at 99', async () => {
    await cart().add(joy, 98);
    await cart().add(joy, 5);
    expect(cart().items[0].quantity).toBe(99);
  });
});

describe('server mode', () => {
  test('syncAfterAuth posts the local cart to /cart/merge and switches to server mode', async () => {
    let received;
    server.use(
      http.post(`${API}/cart/merge`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({
          ...cartResponse([[joy, 3], [path, 1]]),
          skipped: [{ bookId: 'gone', reason: 'NOT_FOUND' }],
        });
      }),
    );
    await cart().add(joy, 2);
    signIn('customer');
    useCartStore.setState({ items: [{ book: joy, quantity: 2 }] });

    const skipped = await cart().syncAfterAuth();
    expect(received).toEqual({ items: [{ bookId: joy.id, quantity: 2 }] });
    expect(skipped).toEqual([{ bookId: 'gone', reason: 'NOT_FOUND' }]);
    expect(cart().mode).toBe('server');
    expect(selectItemCount(cart())).toBe(4);
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)).state.items).toEqual([]);
  });

  test('actions call the API and take the server response', async () => {
    const calls = [];
    server.use(
      http.post(`${API}/cart/items`, async ({ request }) => {
        calls.push(['POST', await request.json()]);
        return HttpResponse.json(cartResponse([[joy, 1]]));
      }),
      http.put(`${API}/cart/items/:bookId`, async ({ request, params }) => {
        calls.push(['PUT', params.bookId, await request.json()]);
        return HttpResponse.json(cartResponse([[joy, 4]]));
      }),
      http.delete(`${API}/cart/items/:bookId`, ({ params }) => {
        calls.push(['DELETE', params.bookId]);
        return HttpResponse.json(cartResponse([]));
      }),
    );
    signIn('customer');
    useCartStore.setState({ mode: 'server', items: [] });

    await cart().add(joy);
    await cart().update(joy.id, 4);
    expect(cart().items[0].quantity).toBe(4);
    await cart().remove(joy.id);
    expect(cart().items).toEqual([]);
    expect(calls).toEqual([
      ['POST', { bookId: joy.id, quantity: 1 }],
      ['PUT', joy.id, { quantity: 4 }],
      ['DELETE', joy.id],
    ]);
  });

  test('reset returns to an empty local cart', () => {
    useCartStore.setState({ mode: 'server', items: [{ book: joy, quantity: 1 }] });
    cart().reset();
    expect(cart()).toMatchObject({ mode: 'local', items: [] });
  });
});
