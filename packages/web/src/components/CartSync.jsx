import { useEffect } from 'react';
import { sessionHandlers } from '../api/client.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { useCartStore } from '../stores/useCartStore.js';

/** Keeps the cart mode in step with the session: fetch the server cart when signed in, reset on logout. */
export default function CartSync() {
  const token = useAuthStore((state) => state.token);
  const mode = useCartStore((state) => state.mode);

  useEffect(() => {
    sessionHandlers.onLogout = () => useCartStore.getState().reset();
  }, []);

  useEffect(() => {
    const cart = useCartStore.getState();
    if (token && mode === 'server') cart.fetch().catch(() => {});
    else if (token && mode === 'local') cart.syncAfterAuth().catch(() => {});
    else if (!token && mode === 'server') cart.reset();
  }, [token, mode]);

  return null;
}
