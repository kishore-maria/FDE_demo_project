import { forbidden, unauthorized } from '../lib/errors.js';
import { TokenExpiredError, verifyToken } from '../lib/jwt.js';

function readBearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return { missing: true };
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return { malformed: true };
  return { token };
}

/**
 * Verifies the bearer token and sets req.user = { id, email, role, firstName, lastName, gsid, orderId }.
 * With { optional: true } a missing or invalid token is ignored and the request continues anonymously.
 * Order-scoped tokens (Track Order → Manage) are refused with 403 unless the route opts in with
 * { allowOrderScope: true }; on optional routes they are ignored.
 */
export function authenticate({ optional = false, allowOrderScope = false } = {}) {
  return (req, res, next) => {
    const { token, missing } = readBearerToken(req);
    if (!token) {
      if (optional) return next();
      return next(unauthorized(missing ? 'Authentication required' : 'Invalid authorization header'));
    }

    let claims;
    try {
      claims = verifyToken(token);
    } catch (error) {
      if (optional) return next();
      if (error instanceof TokenExpiredError) {
        return next(unauthorized('Your session has expired, please log in again', 'TOKEN_EXPIRED'));
      }
      return next(unauthorized('Invalid token'));
    }

    const orderScoped = claims.scope === 'order';
    if (orderScoped && !allowOrderScope) {
      if (optional) return next();
      return next(forbidden('This link only lets you manage a single order', 'ORDER_SCOPE_ONLY'));
    }
    req.user = {
      id: claims.sub,
      email: claims.email,
      role: claims.role,
      firstName: claims.firstName,
      lastName: claims.lastName,
      gsid: claims.gsid ?? null,
      orderId: orderScoped ? claims.oid : null,
    };
    return next();
  };
}
