import { Router } from 'express';
import { TransferService } from '../services/transfer.service.js';
import { logger } from '../config/logger.js';
import { handleError } from '../utils/error.handler.js';
import type { Request } from 'express';
import type { TransferCreateInput } from '../models/transfer.model.js';
import { auth } from '../middleware/middleware.js';

const router = Router();

const transferService = new TransferService();

router.get('/transfers/:id', auth, async (req, res) => {
  logger.info({ transfer_id: req.params.id }, 'Received get transfer request');
  try {
    const result = await transferService.getTransfer(req.params.id);
    res.json(result);
  } catch (error) {
    return handleError(error, res);
  }
});

router.post('/transfers', auth, async (req, res) => {
  logger.info('Received create transfer request');
  try {
    const result = await transferService.transfer(req.body);
    res.json(result);
  } catch (error) {
    return handleError(error, res);
  }
});

export default router;