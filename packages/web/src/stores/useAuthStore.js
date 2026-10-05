import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const AUTH_STORAGE_KEY = 'bookworm-auth';

/**
 * Session state. Registered users (CUSTOMER/ADMIN) and guests both hold a token;
 * guests are limited to the checkout of their current guest session.
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: ({ token, user }) => set({ token, user }),
      setGuestSession: ({ token, user }) => set({ token, user }),
      updateUser: (user) => set((state) => ({ user: { ...state.user, ...user } })),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ user, token }) => ({ user, token }),
    },
  ),
);

export const selectIsAuthenticated = (state) => Boolean(state.token);
export const selectIsGuest = (state) => state.user?.role === 'GUEST';
export const selectIsRegistered = (state) => ['CUSTOMER', 'ADMIN'].includes(state.user?.role);
export const selectIsAdmin = (state) => state.user?.role === 'ADMIN';
