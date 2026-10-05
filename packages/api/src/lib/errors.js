/** An expected, client-facing error. Rendered as { error: { code, message, details? } }. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details, code = 'BAD_REQUEST') =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have access to this resource', code = 'FORBIDDEN') =>
  new AppError(403, code, message);
export const notFound = (message = 'Resource not found', code = 'NOT_FOUND') =>
  new AppError(404, code, message);
export const conflict = (message, code = 'CONFLICT', details) => new AppError(409, code, message, details);
export const unprocessable = (message, code = 'UNPROCESSABLE', details) =>
  new AppError(422, code, message, details);
