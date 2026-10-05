import { computeOrderTotals } from 'bookworm-shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from '../api/client.js';

export const CART_STORAGE_KEY = 'bookworm-cart';
const MAX_QUANTITY = 99;

const fromServer = (cart) => cart.items.map(({ book, quantity }) => ({ book, quantity }));

/**
 * Cart in two modes:
 * - local: anonymous visitors; items live in localStorage;
 * - server: any signed-in session (customer or guest); the API cart is the source of truth.
 * `syncAfterAuth()` merges the local cart into the server cart right after login/register/guest-session.
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      mode: 'local',
      items: [],
      loading: false,

      async fetch() {
        if (get().mode !== 'server') return;
        set({ loading: true });
        try {
          const { data } = await api.get('/cart');
          set({ items: fromServer(data) });
        } finally {
          set({ loading: false });
        }
      },

      async add(book, quantity = 1) {
        if (get().mode === 'server') {
          const { data } = await api.post('/cart/items', { bookId: book.id, quantity });
          set({ items: fromServer(data) });
          return;
        }
        set(({ items }) => {
          const existing = items.find((item) => item.book.id === book.id);
          if (!existing) return { items: [...items, { book, quantity: Math.min(quantity, MAX_QUANTITY) }] };
          return {
            items: items.map((item) =>
              item.book.id === book.id ? { ...item, quantity: Math.min(item.quantity + quantity, MAX_QUANTITY) } : item,
            ),
          };
        });
      },

      async update(bookId, quantity) {
        if (get().mode === 'server') {
          const { data } = await api.put(`/cart/items/${bookId}`, { quantity });
          set({ items: fromServer(data) });
          return;
        }
        set(({ items }) => ({
          items:
            quantity <= 0
              ? items.filter((item) => item.book.id !== bookId)
              : items.map((item) => (item.book.id === bookId ? { ...item, quantity: Math.min(quantity, MAX_QUANTITY) } : item)),
        }));
      },

      async remove(bookId) {
        if (get().mode === 'server') {
          const { data } = await api.delete(`/cart/items/${bookId}`);
          set({ items: fromServer(data) });
          return;
        }
        set(({ items }) => ({ items: items.filter((item) => item.book.id !== bookId) }));
      },

      async clear() {
        if (get().mode === 'server') await api.delete('/cart');
        set({ items: [] });
      },

      /** Replace the cart with a server response (e.g. after buy-again or payment). */
      setFromServer(cart) {
        set({ items: fromServer(cart) });
      },

      /** Merge the browser cart into the server cart and switch to server mode. Returns skipped lines. */
      async syncAfterAuth() {
        const lines = get().mode === 'local' ? get().items.map(({ book, quantity }) => ({ bookId: book.id, quantity })) : [];
        const { data } = await api.post('/cart/merge', { items: lines });
        set({ mode: 'server', items: fromServer(data) });
        return data.skipped ?? [];
      },

      /** After logout the cart starts empty in local mode. */
      reset() {
        set({ mode: 'local', items: [] });
      },
    }),
    {
      name: CART_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Server carts are re-fetched; only the anonymous cart needs to survive a reload.
      partialize: ({ mode, items }) => ({ mode, items: mode === 'local' ? items : [] }),
    },
  ),
);

export const selectItemCount = (state) => state.items.reduce((sum, item) => sum + item.quantity, 0);

/** Totals preview via the shared pricing function (same maths as checkout). */
export function cartTotals(items, options = {}) {
  return computeOrderTotals({
    items: items.map(({ book, quantity }) => ({ pricePaise: book.pricePaise, quantity, format: book.format })),
    ...options,
  });
}

export const selectSubtotalPaise = (state) => cartTotals(state.items).subtotalPaise;
