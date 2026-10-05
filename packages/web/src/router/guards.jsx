import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { selectIsAdmin, selectIsRegistered, useAuthStore } from '../stores/useAuthStore.js';

function loginRedirect(location) {
  const target = `${location.pathname}${location.search}`;
  return `/login?redirect=${encodeURIComponent(target)}`;
}

/** Registered customers and admins only; everyone else is sent to login and brought back afterwards. */
export function RequireRegistered({ children }) {
  const location = useLocation();
  const isRegistered = useAuthStore(selectIsRegistered);
  if (!isRegistered) return <Navigate to={loginRedirect(location)} replace />;
  return children;
}

/** Admins only. Logged-in non-admins go home; anonymous users go to login. */
export function RequireAdmin({ children }) {
  const location = useLocation();
  const isRegistered = useAuthStore(selectIsRegistered);
  const isAdmin = useAuthStore(selectIsAdmin);
  if (!isRegistered) return <Navigate to={loginRedirect(location)} replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

RequireRegistered.propTypes = { children: PropTypes.node.isRequired };
RequireAdmin.propTypes = { children: PropTypes.node.isRequired };
