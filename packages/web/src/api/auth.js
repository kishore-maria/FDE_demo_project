import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/useAuthStore.js';
import { useCartStore } from '../stores/useCartStore.js';
import { api } from './client.js';
import { withToken } from './orders.js';

/** Stores the session from an AuthResponse and merges the browser cart into the server cart. */
export async function startSession(authResponse) {
  useAuthStore.getState().login(authResponse);
  try {
    const skipped = await useCartStore.getState().syncAfterAuth();
    if (skipped.length > 0) toast(`${skipped.length} item(s) in your cart were adjusted to match stock`);
  } catch {
    toast.error('We could not restore your cart. Please check it before checkout.');
  }
}

export async function login(credentials) {
  const { data } = await api.post('/auth/login', credentials, { skipAuth: true });
  await startSession(data);
  return data.user;
}

export async function register(input) {
  const { data } = await api.post('/auth/register', input, { skipAuth: true });
  await startSession(data);
  return data.user;
}

/** Guest checkout: 409 ACCOUNT_EXISTS means the email belongs to a registered account. */
export async function startGuestSession(email) {
  const { data } = await api.post('/auth/guest-session', { email }, { skipAuth: true });
  await startSession(data);
  return data.user;
}

/** Guest → customer conversion after a successful order. */
export async function setPassword(password, confirmPassword) {
  const { data } = await api.put('/auth/set-password', { password, confirmPassword });
  useAuthStore.getState().login(data);
  return data.user;
}

/** Track Order → Manage: claims the guest account with the order-scoped token and signs in. */
export async function claimGuestAccount(orderToken, password, confirmPassword) {
  const { data } = await api.put('/auth/set-password', { password, confirmPassword }, withToken(orderToken));
  await startSession(data);
  return data.user;
}

/** Mirrors the API's Password schema. */
export function passwordProblem(password) {
  if (password.length < 8) return 'Use at least 8 characters';
  if (!/[A-Z]/.test(password) || !/\d/.test(password)) return 'Include an uppercase letter and a number';
  return null;
}
