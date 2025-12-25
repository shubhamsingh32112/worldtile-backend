/**
 * Custom Application Error with HTTP status code and metadata
 */
export class AppError extends Error {
  statusCode: number;
  meta: Record<string, any>;

  constructor(statusCode: number, message: string, meta: Record<string, any> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.meta = meta;
    this.name = 'AppError';
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

