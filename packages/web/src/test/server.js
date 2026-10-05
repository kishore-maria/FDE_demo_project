import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const API = 'http://localhost:3001/api';
export const emptyCart = { items: [], itemCount: 0, subtotalPaise: 0, subtotalInr: '₹0' };

// Layout-level calls (cart sync) that most page tests don't care about.
const defaults = [
  http.get(`${API}/cart`, () => HttpResponse.json(emptyCart)),
  http.post(`${API}/cart/merge`, () => HttpResponse.json({ ...emptyCart, skipped: [] })),
];

/** Shared MSW server; tests add handlers with server.use(...). Unhandled requests fail the test. */
export const server = setupServer(...defaults);
