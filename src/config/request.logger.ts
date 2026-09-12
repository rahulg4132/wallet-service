import type { RequestHandler } from 'express';
import { logger } from './logger.js';

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      correlation_id: req.cid,
      status_code: res.statusCode,
      duration_ms: Date.now() - startedAt,
    }, 'request_completed');
  });

  next();
};