import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { TransferCreateInput, Transfer, TransferResponse } from '../models/transfer.model.js';
import { AppError } from '../utils/error.handler.js';
import { hashBody } from '../utils/hash.body.js';

const TRANSFER_QUERIES = {
  begin: 'BEGIN',
  rollback: 'ROLLBACK',
  commit: 'COMMIT',
  getById: `SELECT id, idempotency_key, from_wallet, to_wallet, amount, status, created_at
            FROM transfers WHERE id = $1`,
  insert: `INSERT INTO transfers (idempotency_key, request_hash, from_wallet, to_wallet, amount, status)
                VALUES ($1, $2, $3, $4, $5, 'in_progress')
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING id`,
  getByIdempotencyKey: 'SELECT * FROM transfers WHERE idempotency_key = $1 FOR UPDATE',
  lockWallet: 'SELECT id FROM wallets WHERE id = $1 FOR UPDATE',
  debit: `UPDATE wallets SET balance = balance - $1
                WHERE id = $2 AND balance >= $1
                RETURNING id`,
  decline: "UPDATE transfers SET status = 'declined' WHERE id = $1",
  credit: 'UPDATE wallets SET balance = balance + $1 WHERE id = $2',
  complete: "UPDATE transfers SET status = 'completed' WHERE id = $1",
} as const;

export class TransferService {

  async getTransfer(id: string): Promise<Transfer | null> {
    const res = await pool.query<Transfer>(
      TRANSFER_QUERIES.getById,
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
      await client.query(TRANSFER_QUERIES.begin);
      const attemptInsert = await client.query<{ id: string }>(
        TRANSFER_QUERIES.insert,
        [idempotencyKey, requestHash, from, to, amount]
      );
      if (attemptInsert.rows.length === 0) {
        const existing = await client.query<Transfer>(
          TRANSFER_QUERIES.getByIdempotencyKey,
          [idempotencyKey]
        );
        await client.query(TRANSFER_QUERIES.rollback);

        const row = existing.rows[0];
        if (!row) {
          throw new AppError('transfer not found for idempotency key', 404);
        }
        if (row.request_hash !== requestHash) {
          throw new AppError('idempotency_key reused with a different request body', 409);
        }
        logger.info({ idempotency_key: idempotencyKey, transfer_id: row.id }, 'idempotent_replay_hit');
        return {
          id: row.id,
          from_wallet: row.from_wallet,
          to_wallet: row.to_wallet,
          amount: row.amount,
          status: row.status,
        };
      }
      const insertedTransfer = attemptInsert.rows[0];
      if (!insertedTransfer) {
        throw new AppError('failed to create transfer', 500);
      }
      const transferId = insertedTransfer.id;
      logger.info({ transfer_id: transferId, from, to, amount }, 'transfer_created');

      await this.lockWallets(from, to, client);

      // Atomic conditional debit, unconditional credit.
      await this.executeMoneyMovement(client, amount, from, transferId, to);

      await client.query(TRANSFER_QUERIES.complete, [transferId]);
      await client.query(TRANSFER_QUERIES.commit);

      return {
        id: transferId,
        from_wallet: from,
        to_wallet: to,
        amount: amount,
        status: 'completed',
      };
    } catch (e) {
      await client.query(TRANSFER_QUERIES.rollback);
      throw e;
    } finally {
      client.release();
    }
  }

  private async lockWallets(from: string, to: string, client: PoolClient) {
    // Deterministic lock order: always touch the lower wallet id first.
    const [firstId, secondId] = [from, to].sort();

    const firstLock = await client.query(TRANSFER_QUERIES.lockWallet, [firstId]);
    const secondLock = await client.query(TRANSFER_QUERIES.lockWallet, [secondId]);
    if (firstLock.rowCount === 0 || secondLock.rowCount === 0) {
      await client.query(TRANSFER_QUERIES.rollback);
      throw new AppError('from or to wallet does not exist', 404);
    }
  }

  private async executeMoneyMovement(client: PoolClient, amount: number, from: string, transferId: string, to: string) {
    const debitResult = await client.query(
      TRANSFER_QUERIES.debit,
      [amount, from]
    );

    if (debitResult.rowCount === 0) {
      await client.query(TRANSFER_QUERIES.decline, [transferId]);
      await client.query(TRANSFER_QUERIES.commit);
      logger.warn({
        transfer_id: transferId,
        from,
        to,
        amount: amount,
      }, 'transfer_declined_insufficient_funds');
      throw new AppError('insufficient funds', 409, {
        transfer_id: transferId,
        status: 'declined',
        reason: 'insufficient_funds',
      });
    }

    logger.info({ transfer_id: transferId, wallet_id: from, amount }, 'transfer_debited');

    await client.query(TRANSFER_QUERIES.credit, [
      amount,
      to,
    ]);
    logger.info({ transfer_id: transferId, wallet_id: to, amount }, 'transfer_credited');
  }
}
