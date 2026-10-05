import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useAuthStore } from '../stores/useAuthStore.js';
import { useCartStore } from '../stores/useCartStore.js';
import { cartResponse, joy } from '../test/fixtures.js';
import { API, server } from '../test/server.js';
import { renderApp, signOut, users } from '../test/utils.jsx';

vi.mock('react-hot-toast', () => import('../test/toastMock.js'));

afterEach(() => {
  signOut();
  vi.clearAllMocks();
});

async function fillAndSubmit(email, password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('e-mail'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Login' }));
}

describe('LoginPage', () => {
  test('logs in, merges the browser cart and returns to the redirect target', async () => {
    let merged;
    server.use(
      http.post(`${API}/auth/login`, () => HttpResponse.json({ token: 'jwt-customer', user: users.customer })),
      http.post(`${API}/cart/merge`, async ({ request }) => {
        merged = await request.json();
        return HttpResponse.json({ ...cartResponse([[joy, 2]]), skipped: [] });
      }),
      http.get(`${API}/cart`, () => HttpResponse.json(cartResponse([[joy, 2]]))),
    );
    useCartStore.setState({ mode: 'local', items: [{ book: joy, quantity: 2 }] });

    renderApp('/login?redirect=%2Forders');
    await fillAndSubmit('customer@test.com', 'Test@1234');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/orders'));
    expect(useAuthStore.getState()).toMatchObject({ token: 'jwt-customer', user: { email: 'customer@test.com' } });
    expect(merged).toEqual({ items: [{ bookId: joy.id, quantity: 2 }] });
    expect(useCartStore.getState().mode).toBe('server');
    expect(toast.success).toHaveBeenCalledWith('Welcome back, John!');
    expect(await screen.findByTestId('cart-badge')).toHaveTextContent('2');
  });

  test('goes home when there is no redirect', async () => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json({ token: 't', user: users.customer })));
    renderApp('/login');
    await fillAndSubmit('customer@test.com', 'Test@1234');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  test('ignores external redirect targets', async () => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json({ token: 't', user: users.customer })));
    renderApp('/login?redirect=https%3A%2F%2Fevil.example');
    await fillAndSubmit('customer@test.com', 'Test@1234');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  test('wrong password shows a toast and stays signed out', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }, { status: 401 }),
      ),
    );
    renderApp('/login');
    await fillAndSubmit('customer@test.com', 'wrong');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid email or password'));
    expect(useAuthStore.getState().token).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  test('empty fields show inline errors without calling the API', async () => {
    renderApp('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByText('Enter your e-mail')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });
});
