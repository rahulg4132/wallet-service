
import type { Response } from 'express';

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
    return res.status(error.statusCode).json({ error: error.message });
  }
  return res.status(500).json({ error: message });
};
