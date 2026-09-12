import { Router } from 'express';
import { WalletService } from '../services/wallet.service.js';
import { handleError } from '../utils/error.handler.js';

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

export default router;