import { Router } from 'express';
import { WalletService } from '../services/wallet.service.js';
import { logger } from '../config/logger.js';
import { handleError } from '../utils/error.handler.js';
import type { WalletCreateInput } from '../models/wallet.model.js';
import type { Request } from 'express';
import { auth } from '../middleware/middleware.js';

const router = Router();

const walletService = new WalletService();

router.get('/wallets/:id', auth, async (req, res) => {
  logger.info({ wallet_id: req.params.id }, 'Received get wallet request');
  try {
    const wallet = await walletService.getWalletById(req.params.id);
    res.json(wallet);
  } catch (error) {
    return handleError(error, res);
  }
});

router.post('/wallets', auth, async (req, res) => {
  logger.info('Received create wallet request');
  try {
    const wallet = await walletService.getOrCreateWallet(req.body);
    res.json(wallet);
  } catch (error) {
    return handleError(error, res);
  }
});

export default router;