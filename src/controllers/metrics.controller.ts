import { Router } from 'express';
import * as metrics from '../config/metrics.js';
import { auth } from '../middleware/middleware.js';

const router = Router();

router.get('/metrics', auth, async (_req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

export default router;
