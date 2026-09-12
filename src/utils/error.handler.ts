
import type { Response } from 'express';
import { logger } from '../config/logger.js';

export class AppError extends Error {
  statusCode: number;
  body?: Record<string, unknown> | undefined;
  constructor(message: string, statusCode: number, body?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.body = body;
  }
}

export const handleError = (
  error: unknown,
  res: Response,
  message = 'Internal Server Error',
) => {
  if (error instanceof AppError) {
    logger.error({
      err: error,
      status_code: error.statusCode,
      details: error.body,
    }, 'request_failed');
    return res.status(error.statusCode).json({ error: error.message, ...(error.body ?? {}) });
  }

  logger.error({
    err: error,
    status_code: 500,
    fallback_message: message,
  }, 'unexpected_request_error');
  return res.status(500).json({ error: message });
};
