import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { API, server } from '../test/server.js';
import { signIn, signOut } from '../test/utils.jsx';
import { useAuthStore } from '../stores/useAuthStore.js';
import { api, errorCode, errorMessage, sessionHandlers } from './client.js';

vi.mock('react-hot-toast', () => {
  const toastFn = vi.fn();
  toastFn.error = vi.fn();
  toastFn.success = vi.fn();
  return { default: toastFn, toast: toastFn, Toaster: () => null };
});

const unauthorized = () =>
  HttpResponse.json({ error: { code: 'TOKEN_EXPIRED', message: 'Your session has expired' } }, { status: 401 });

beforeEach(() => {
  sessionHandlers.redirectToLogin = vi.fn();
  sessionHandlers.onLogout = vi.fn();
  vi.clearAllMocks();
});
afterEach(signOut);

describe('api client', () => {
  test('sends the bearer token when signed in, none when anonymous', async () => {
    const seen = [];
    server.use(
      http.get(`${API}/auth/profile`, ({ request }) => {
        seen.push(request.headers.get('authorization'));
        return HttpResponse.json({});
      }),
    );
    await api.get('/auth/profile');
    signIn('customer');
    await api.get('/auth/profile');
    expect(seen).toEqual([null, 'Bearer token-customer']);
  });

  test('401 for a registered user logs out and redirects to login', async () => {
    server.use(http.get(`${API}/orders`, unauthorized));
    signIn('customer');
    await expect(api.get('/orders')).rejects.toMatchObject({ response: { status: 401 } });
    expect(useAuthStore.getState().token).toBeNull();
    expect(sessionHandlers.onLogout).toHaveBeenCalled();
    expect(sessionHandlers.redirectToLogin).toHaveBeenCalledWith('/');
  });

  test('401 for a guest clears the token and shows the session-expired toast', async () => {
    server.use(http.get(`${API}/cart`, unauthorized));
    signIn('guest');
    await expect(api.get('/cart')).rejects.toBeTruthy();
    expect(useAuthStore.getState().token).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Session expired, enter email again');
    expect(sessionHandlers.redirectToLogin).not.toHaveBeenCalled();
  });

  test('optional-auth GETs are retried without the token', async () => {
    const seen = [];
    server.use(
      http.get(`${API}/books/recommended`, ({ request }) => {
        const auth = request.headers.get('authorization');
        seen.push(auth);
        return auth ? unauthorized() : HttpResponse.json({ source: 'editors_pick', items: [] });
      }),
    );
    signIn('customer');
    const res = await api.get('/books/recommended', { optionalAuth: true });
    expect(res.data.source).toBe('editors_pick');
    expect(seen).toEqual(['Bearer token-customer', null]);
    expect(useAuthStore.getState().token).toBeNull();
    expect(sessionHandlers.redirectToLogin).not.toHaveBeenCalled();
  });

  test('401 without a token (e.g. wrong password) is passed through untouched', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }, { status: 401 }),
      ),
    );
    const error = await api.post('/auth/login', {}).catch((e) => e);
    expect(errorMessage(error)).toBe('Invalid email or password');
    expect(errorCode(error)).toBe('INVALID_CREDENTIALS');
    expect(sessionHandlers.onLogout).not.toHaveBeenCalled();
  });

  test('errorMessage falls back for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(errorMessage({ request: {} })).toBe('Cannot reach the server');
  });
});
