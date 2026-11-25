export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, code = "BAD_REQUEST", details?: unknown): AppError {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = "Authentication required", code = "UNAUTHORIZED"): AppError {
  return new AppError(401, code, message);
}

export function forbidden(message = "Access denied", code = "FORBIDDEN"): AppError {
  return new AppError(403, code, message);
}

export function notFound(message = "Resource not found", code = "NOT_FOUND"): AppError {
  return new AppError(404, code, message);
}

export function conflict(message: string, code = "CONFLICT"): AppError {
  return new AppError(409, code, message);
}

export function tooManyRequests(message = "Too many requests", code = "RATE_LIMITED"): AppError {
  return new AppError(429, code, message);
}
