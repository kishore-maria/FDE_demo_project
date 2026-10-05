import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const API = 'http://localhost:3001/api';
export const emptyCart = { items: [], itemCount: 0, subtotalPaise: 0, subtotalInr: '₹0' };
export const emptyPage = { items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 };

// Layout-level and catalogue calls that most tests don't care about; tests override with server.use(...).
const defaults = [
  http.get(`${API}/cart`, () => HttpResponse.json(emptyCart)),
  http.post(`${API}/cart/merge`, () => HttpResponse.json({ ...emptyCart, skipped: [] })),
  http.get(`${API}/categories`, () => HttpResponse.json({ items: [] })),
  http.get(`${API}/publishers`, () => HttpResponse.json({ items: [] })),
  http.get(`${API}/books/recommended`, () => HttpResponse.json({ source: 'editors_pick', items: [] })),
  http.get(`${API}/books/bestsellers`, () => HttpResponse.json({ items: [] })),
  http.get(`${API}/books/new-launches`, () => HttpResponse.json({ items: [] })),
  http.get(`${API}/books`, () => HttpResponse.json(emptyPage)),
  http.get(`${API}/admin/books`, () => HttpResponse.json(emptyPage)),
  http.get(`${API}/orders`, () => HttpResponse.json(emptyPage)),
];

/** Shared MSW server; tests add handlers with server.use(...). Unhandled requests fail the test. */
export const server = setupServer(...defaults);
