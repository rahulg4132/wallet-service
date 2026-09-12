import { Router } from 'express';
import { TransferService } from '../services/transfer.service.js';
import { handleError } from '../utils/error.handler.js';
import type { Request } from 'express';
import type { TransferCreateInput } from '../models/transfer.model.js';

const router = Router();

const transferService = new TransferService();

router.get('/transfers/:id', async (req, res) => {
  try {
    const result = transferService.getTransfer(req.params.id);
    res.json(result);
  } catch (error) {
    return handleError(error, res);
  }
});

router.post('/transfers', async (req: Request<{}, {}, TransferCreateInput>, res) => {
  try {
    const result = transferService.transfer(req.body);
    res.json(result);
  } catch (error) {
    return handleError(error, res);
  }
});

export default router;