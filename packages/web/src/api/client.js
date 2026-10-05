import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/useAuthStore.js';

export const API_URL = import.meta.env.VITE_API_URL || '/api';

/** Hooks the app can replace (tests stub them). */
export const sessionHandlers = {
  redirectToLogin(returnTo) {
    window.location.assign(`/login?redirect=${encodeURIComponent(returnTo)}`);
  },
  onLogout: () => {},
};

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const { token } = useAuthStore.getState();
  if (token && !config.skipAuth) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function endSession({ redirect }) {
  const { user, logout } = useAuthStore.getState();
  const wasGuest = user?.role === 'GUEST';
  logout();
  sessionHandlers.onLogout();

  if (wasGuest) {
    toast.error('Session expired, enter email again');
  } else if (redirect) {
    sessionHandlers.redirectToLogin(`${window.location.pathname}${window.location.search}`);
  } else {
    toast('You have been signed out');
  }
}

/**
 * 401 policy:
 * - optional-auth GETs (`optionalAuth: true`) are retried once without the token after the session is cleared;
 * - registered users are logged out and sent to login; guests are logged out with a toast.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const hadToken = Boolean(config?.headers?.Authorization);
    if (response?.status !== 401 || !hadToken || config.skipAuth) throw error;

    if (config.optionalAuth && !config.retriedWithoutAuth) {
      endSession({ redirect: false });
      delete config.headers.Authorization;
      return api({ ...config, skipAuth: true, retriedWithoutAuth: true });
    }

    endSession({ redirect: true });
    throw error;
  },
);

/** Human-readable message from an API error ({ error: { message } }) or a network failure. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.error?.message ?? (error?.request && !error?.response ? 'Cannot reach the server' : fallback);
}

export const errorCode = (error) => error?.response?.data?.error?.code;
