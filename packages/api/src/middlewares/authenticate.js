import { unauthorized } from '../lib/errors.js';
import { TokenExpiredError, verifyToken } from '../lib/jwt.js';

function readBearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return { missing: true };
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return { malformed: true };
  return { token };
}

/**
 * Verifies the bearer token and sets req.user = { id, email, role, firstName, lastName, gsid }.
 * With { optional: true } a missing or invalid token is ignored and the request continues anonymously.
 */
export function authenticate({ optional = false } = {}) {
  return (req, res, next) => {
    const { token, missing } = readBearerToken(req);
    if (!token) {
      if (optional) return next();
      return next(unauthorized(missing ? 'Authentication required' : 'Invalid authorization header'));
    }

    try {
      const claims = verifyToken(token);
      req.user = {
        id: claims.sub,
        email: claims.email,
        role: claims.role,
        firstName: claims.firstName,
        lastName: claims.lastName,
        gsid: claims.gsid ?? null,
      };
      return next();
    } catch (error) {
      if (optional) return next();
      if (error instanceof TokenExpiredError) {
        return next(unauthorized('Your session has expired, please log in again', 'TOKEN_EXPIRED'));
      }
      return next(unauthorized('Invalid token'));
    }
  };
}
