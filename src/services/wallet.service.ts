import { queryDatabase } from '../config/database.js';
import type { Wallet } from '../models/wallet.model.js';

export class WalletService {
	async getWalletById(id: string): Promise<Wallet | null> {
		const result = await queryDatabase<Wallet>(
			'SELECT id, user_id, balance, status, created_at FROM wallets WHERE id = $1',
			[id],
		);
		return result.rows[0] ?? null;
	}
}
