import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

const VALIDATOR_CODES = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  406: 'NOT_ACCEPTABLE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

// res.send (not res.json) so error bodies bypass OpenAPI response validation.
function sendError(res, status, code, message, details) {
  const body = { error: { code, message, ...(details !== undefined && { details }) } };
  res.status(status).type('application/json').send(JSON.stringify(body));
}

const isValidatorError = (err) => Number.isInteger(err?.status) && Array.isArray(err?.errors);

function fromValidator(err) {
  const details = err.errors.map(({ path, message }) => ({ path, message }));
  if (err.status >= 500) {
    // The handler returned a body that does not match openapi.yaml.
    return { status: 500, code: 'RESPONSE_VALIDATION_ERROR', message: err.message, details };
  }
  const message = err.status === 404 ? 'Route not found' : err.message;
  return {
    status: err.status,
    code: VALIDATOR_CODES[err.status] ?? 'REQUEST_ERROR',
    message,
    details: err.status === 400 ? details : undefined,
  };
}

function fromPrisma(err) {
  if (err.code === 'P2002') {
    return { status: 409, code: 'CONFLICT', message: 'A record with these details already exists' };
  }
  if (err.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' };
  return null;
}

export function notFoundHandler(req, res) {
  sendError(res, 404, 'NOT_FOUND', 'Route not found');
}

// Express requires the 4-argument signature to recognise error middleware.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, err.status, err.code, err.message, err.details);
  }
  if (isValidatorError(err)) {
    const mapped = fromValidator(err);
    if (mapped.status >= 500) console.error('[openapi] response validation failed:', mapped.message);
    return sendError(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
  if (err?.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  if (err?.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = fromPrisma(err);
    if (mapped) return sendError(res, mapped.status, mapped.code, mapped.message);
  }

  if (process.env.NODE_ENV !== 'test') console.error(err);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}
