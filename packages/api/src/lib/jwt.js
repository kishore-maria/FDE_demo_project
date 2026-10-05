import jwt from 'jsonwebtoken';

const ALGORITHM = 'HS256';

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not configured');
  return value;
}

/**
 * Signs an access token. Guests get the short guest lifetime and carry their guest-session id (gsid).
 * Claims: sub (user id), email, role, firstName, lastName, gsid?
 */
export function signToken(user, { gsid } = {}) {
  const isGuest = user.role === 'GUEST';
  const payload = {
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    ...(gsid && { gsid }),
  };
  return jwt.sign(payload, secret(), {
    algorithm: ALGORITHM,
    subject: user.id,
    expiresIn: isGuest ? process.env.JWT_GUEST_EXPIRES_IN ?? '24h' : process.env.JWT_EXPIRES_IN ?? '7d',
  });
}

/** Verifies a token; throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError). */
export function verifyToken(token) {
  return jwt.verify(token, secret(), { algorithms: [ALGORITHM] });
}

// jsonwebtoken is CommonJS; Node 20 can't statically detect this named export, so re-export via the default.
export const { TokenExpiredError } = jwt;
