import { Router } from 'express';
import { WalletService } from '../services/wallet.service.js';
import { handleError } from '../utils/error.handler.js';
import type { WalletCreateInput } from '../models/wallet.model.js';
import type { Request } from 'express';

const router = Router();

const walletService = new WalletService();

router.get('/wallets/:id', async (req, res) => {
    try {
        const wallet = await walletService.getWalletById(req.params.id);
        res.json(wallet);
    } catch (error) {
        return handleError(error, res);
    }
});

router.post('/wallets', async (req: Request<{}, {}, WalletCreateInput>, res) => {
    try {
        const wallet = await walletService.getOrCreateWallet(req.body);
        res.json(wallet);
    } catch (error) {
        return handleError(error, res);
    }
});

export default router;