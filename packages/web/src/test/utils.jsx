import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AppRoutes from '../router/AppRouter.jsx';
import { useAuthStore } from '../stores/useAuthStore.js';
import { useCartStore } from '../stores/useCartStore.js';

export { API } from './server.js';

export const future = { v7_startTransition: true, v7_relativeSplatPath: true };

export const users = {
  customer: { id: 'u-1', email: 'customer@test.com', firstName: 'John', lastName: 'Smith', role: 'CUSTOMER', giftPoints: 200 },
  admin: { id: 'u-2', email: 'admin@bookworm.com', firstName: 'Admin', lastName: 'BookWorm', role: 'ADMIN', giftPoints: 0 },
  guest: { id: 'u-3', email: 'guest@example.com', firstName: '', lastName: '', role: 'GUEST', giftPoints: 0 },
};

/** Signs a fake user into the auth store (no API call). */
export function signIn(role = 'customer') {
  useAuthStore.setState({ user: users[role], token: `token-${role}` });
}

/** Unmounts first so resetting the stores doesn't update components outside act(). */
export function signOut() {
  cleanup();
  useAuthStore.setState({ user: null, token: null });
  useCartStore.setState({ mode: 'local', items: [], loading: false });
}

/** Shows the current location so tests can assert redirects. */
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

/** Renders the whole app at `path`. */
export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]} future={future}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** Renders a single element at `path` (optionally matched by `route`, e.g. "/books/:bookId"). */
export function renderAt(element, { path = '/', route = '*' } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]} future={future}>
      <Routes>
        <Route path={route} element={element} />
        <Route path="*" element={null} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}
