import { forbidden, unauthorized } from '../lib/errors.js';

/** Allows the request only if req.user.role is one of `roles`. Use after authenticate(). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

/** Registered customers and admins only — guests are rejected with 403. */
export const requireRegistered = requireRole('CUSTOMER', 'ADMIN');
