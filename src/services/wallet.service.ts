import { queryDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { Wallet, WalletCreateInput } from '../models/wallet.model.js';
import { AppError } from '../utils/error.handler.js';
import { walletLookups, walletsCreated } from '../config/metrics.js';

const WALLET_QUERIES = {
  getById: 'SELECT id, user_id, balance, created_at FROM wallets WHERE id = $1',
  create: `INSERT INTO wallets (user_id, balance) VALUES ($1, 0)
            ON CONFLICT (user_id) DO NOTHING`,
  getByUserId: 'SELECT id, user_id, balance, created_at FROM wallets WHERE user_id = $1',
} as const;

export class WalletService {
  async getWalletById(id: string): Promise<Wallet> {
    walletLookups.inc();
    const result = await queryDatabase<Wallet>(
      WALLET_QUERIES.getById,
      [id],
    );
    const wallet = result.rows[0] ?? null;
    if (!wallet) {
      throw new AppError(`No wallet found for id: ${id}`, 404);
    }
    return wallet;
  }

  async getOrCreateWallet(input: WalletCreateInput): Promise<Wallet> {
    if (!input || typeof input !== 'object') {
      throw new AppError('request body is required', 400);
    }
    if (typeof input.user_id !== 'string' || input.user_id.trim() === '') {
      throw new AppError('user_id is required', 400);
    }

    const userId = input.user_id;
    const insert = await queryDatabase<Wallet>(
      WALLET_QUERIES.create,
      [userId]
    );
    const createdWallet = insert.rows[0];
    if (createdWallet) {
      walletsCreated.inc();
      logger.info({ user_id: userId, wallet_id: createdWallet.id }, 'wallet_created');
      return createdWallet;
    }
    // We lost the race (or it already existed) — the row is guaranteed to exist now.
    const existing = await queryDatabase<Wallet>(
      WALLET_QUERIES.getByUserId,
      [userId]
    );
    const existingWallet = existing.rows[0];
    if (!existingWallet) {
      throw new AppError(`Unable to find wallet for user ${userId}`, 500);
    }
    return existingWallet;
  }
}
