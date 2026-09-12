import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { TransferCreateInput, Transfer, TransferResponse } from '../models/transfer.model.js';
import { AppError } from '../utils/error.handler.js';
import { hashBody } from '../utils/hash.body.js';

const log = (event: string, data: Record<string, unknown>) => logger.info(data, event);
const toNumber = (value: string | number): number => Number(value);

export class TransferService {

  async getTransfer(id: string): Promise<Transfer | null> {
    const res = await pool.query<Transfer>(
      `SELECT id, idempotency_key, from_wallet, to_wallet, amount, status, created_at
            FROM transfers WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  }

  private async validateInput(input: TransferCreateInput) {
    if (input.from === input.to) {
      throw new AppError('from and to must differ', 400);
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new AppError('amount must be a positive integer', 400);
    }
  }

  async transfer(input: TransferCreateInput): Promise<TransferResponse> {
    this.validateInput(input);
    const { from, to, amount, idempotencyKey } = input;
    const requestHash = hashBody({ from, to, amount });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const attemptInsert = await client.query<{ id: string }>(
        `INSERT INTO transfers (idempotency_key, request_hash, from_wallet, to_wallet, amount, status)
                VALUES ($1, $2, $3, $4, $5, 'in_progress')
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING id`,
        [idempotencyKey, requestHash, from, to, amount]
      );
      if (attemptInsert.rows.length === 0) {
        const existing = await client.query<Transfer>(
          `SELECT * FROM transfers WHERE idempotency_key = $1 FOR UPDATE`,
          [idempotencyKey]
        );
        await client.query('ROLLBACK');

        const row = existing.rows[0];
        if (!row) {
          throw new AppError('transfer not found for idempotency key', 404);
        }
        if (row.request_hash !== requestHash) {
          throw new AppError('idempotency_key reused with a different request body', 409);
        }
        log('idempotent_replay_hit', { idempotency_key: idempotencyKey, transfer_id: row.id });
        return {
          id: row.id,
          from_wallet: row.from_wallet,
          to_wallet: row.to_wallet,
          amount: toNumber(row.amount),
          status: row.status,
        };
      }
      const insertedTransfer = attemptInsert.rows[0];
      if (!insertedTransfer) {
        throw new AppError('failed to create transfer', 500);
      }
      const transferId = insertedTransfer.id;
      logger.info({ transfer_id: transferId, from, to, amount: amount }, 'transfer_created');

      // Deterministic lock order: always touch the lower wallet id first.
      const [firstId, secondId] = [from, to].sort();

      const firstLock = await client.query(`SELECT id FROM wallets WHERE id = $1 FOR UPDATE`, [firstId]);
      const secondLock = await client.query(`SELECT id FROM wallets WHERE id = $1 FOR UPDATE`, [secondId]);
      if (firstLock.rowCount === 0 || secondLock.rowCount === 0) {
        await client.query('ROLLBACK');
        throw new AppError('from or to wallet does not exist', 404);
      }

      // Atomic conditional debit, unconditional credit.
      const debitResult = await client.query(
        `UPDATE wallets SET balance = balance - $1
                WHERE id = $2 AND balance >= $1
                RETURNING id`,
        [amount, from]
      );

      if (debitResult.rowCount === 0) {
        await client.query(`UPDATE transfers SET status = 'declined' WHERE id = $1`, [transferId]);
        await client.query('COMMIT');
        log('transfer_declined_insufficient_funds', {
          transfer_id: transferId,
          from,
          to,
          amount: amount,
        });
        throw new AppError('insufficient funds', 409, {
          transfer_id: transferId,
          status: 'declined',
          reason: 'insufficient_funds',
        });
      }

      log('transfer_debited', { transfer_id: transferId, wallet_id: from, amount: amount });

      await client.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [
        amount,
        to,
      ]);
      log('transfer_credited', { transfer_id: transferId, wallet_id: to, amount: amount });

      await client.query(`UPDATE transfers SET status = 'completed' WHERE id = $1`, [transferId]);
      await client.query('COMMIT');

      return {
        id: transferId,
        from_wallet: from,
        to_wallet: to,
        amount: amount,
        status: 'completed',
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
