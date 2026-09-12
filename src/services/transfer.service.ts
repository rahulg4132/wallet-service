import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { TransferCreateInput, Transfer, TransferResponse } from '../models/transfer.model.js';
import { AppError } from '../utils/error.handler.js';
import { hashBody } from '../utils/hash.body.js';
import { normalizeAmount } from '../utils/random.utils.js';
import { idempotentReplays, transfersCreated, transfersDeclined } from '../config/metrics.js';

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
  getByIdempotencyKey: `SELECT id, idempotency_key, request_hash, from_wallet, to_wallet, amount, status, created_at
            FROM transfers WHERE idempotency_key = $1 FOR UPDATE`,
  lockWallets: 'SELECT id FROM wallets WHERE id IN ($1, $2) ORDER BY id FOR UPDATE',
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
    const transfer = res.rows[0];
    if (!transfer) {
      throw new AppError(`No transfer found for id: ${id}`, 404);
    }
    return { ...transfer, amount: normalizeAmount(transfer.amount) };
  }

  private validateInput(input: TransferCreateInput) {
    if (!input || typeof input !== 'object') {
      throw new AppError('request body is required', 400);
    }
    if (typeof input.from !== 'string' || input.from.trim() === '') {
      throw new AppError('from wallet is required', 400);
    }
    if (typeof input.to !== 'string' || input.to.trim() === '') {
      throw new AppError('to wallet is required', 400);
    }
    if (typeof input.idempotency_key !== 'string' || input.idempotency_key.trim() === '') {
      throw new AppError('idempotencyKey is required', 400);
    }
    if (input.from === input.to) {
      throw new AppError('from and to must differ', 400);
    }
    if (!Number.isSafeInteger(input.amount_paise) || input.amount_paise <= 0) {
      throw new AppError('amount must be a positive integer', 400);
    }
  }

  async transfer(input: TransferCreateInput): Promise<TransferResponse> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.transferOnce(input);
      } catch (error) {
        if (!this.isDeadlock(error) || attempt === maxAttempts) {
          throw error;
        }
        logger.warn({ attempt, max_attempts: maxAttempts }, 'transfer_deadlock_retry');
      }
    }

    throw new AppError('transfer could not be completed', 500);
  }

  private async transferOnce(input: TransferCreateInput): Promise<TransferResponse> {
    this.validateInput(input);
    const { from, to, amount_paise, idempotency_key } = input;
    const requestHash = hashBody({ from, to, amount_paise });
    const client = await pool.connect();
    let transactionActive = false;
    try {
      await client.query(TRANSFER_QUERIES.begin);
      transactionActive = true;

      // IMPORTANT: this must run BEFORE the INSERT below. `transfers` has
      // FK columns (from_wallet, to_wallet) referencing wallets(id); Postgres
      // takes an implicit lock on the referenced rows during INSERT, in
      // (from, to) column order — NOT sorted. If two opposite-direction
      // transfers (A->B and B->A) both hit that INSERT concurrently, their
      // implicit FK locks cross and deadlock, regardless of any sorted lock
      // taken afterward. Taking our own sorted lock first means the FK
      // check on INSERT just confirms a lock we already hold, in the right
      // order — no crossed wait ever forms.
      await this.lockWallets(from, to, client);

      const attemptInsert = await client.query<{ id: string }>(
        TRANSFER_QUERIES.insert,
        [idempotency_key, requestHash, from, to, amount_paise]
      );
      if (attemptInsert.rows.length === 0) {
        const existing = await client.query<Transfer>(
          TRANSFER_QUERIES.getByIdempotencyKey,
          [idempotency_key]
        );
        await client.query(TRANSFER_QUERIES.rollback);
        transactionActive = false;

        const row = existing.rows[0];
        if (!row) {
          throw new AppError('transfer not found for idempotency key', 404);
        }
        if (row.request_hash !== requestHash) {
          throw new AppError('idempotency_key reused with a different request body', 409);
        }
        logger.info({ idempotency_key: idempotency_key, transfer_id: row.id }, 'idempotent_replay_hit');
        idempotentReplays.inc();
        if (row.status === 'in_progress') {
          throw new AppError('transfer is still in progress', 409);
        }
        return {
          id: row.id,
          from_wallet: row.from_wallet,
          to_wallet: row.to_wallet,
          amount: normalizeAmount(row.amount),
          status: row.status,
        };
      }
      const insertedTransfer = attemptInsert.rows[0];
      if (!insertedTransfer) {
        throw new AppError('failed to create transfer', 500);
      }
      const transferId = insertedTransfer.id;
      logger.info({ transfer_id: transferId, from, to, amount_paise }, 'transfer_created');

      const movementError = await this.executeMoneyMovement(client, amount_paise, from, transferId, to);
      if (movementError) {
        await client.query(TRANSFER_QUERIES.commit);
        transactionActive = false;
        throw movementError;
      }

      await client.query(TRANSFER_QUERIES.complete, [transferId]);
      await client.query(TRANSFER_QUERIES.commit);
      transactionActive = false;
      transfersCreated.inc();

      return {
        id: transferId,
        from_wallet: from,
        to_wallet: to,
        amount: amount_paise,
        status: 'completed',
      };
    } catch (e) {
      if (transactionActive) {
        try {
          await client.query(TRANSFER_QUERIES.rollback);
        } catch (rollbackError) {
          logger.error({ err: rollbackError }, 'transfer_rollback_failed');
        }
      }
      throw e;
    } finally {
      client.release();
    }
  }

  private isDeadlock(error: unknown): error is { code: string } {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === '40P01';
  }

  private async lockWallets(from: string, to: string, client: PoolClient) {
    const locks = await client.query(TRANSFER_QUERIES.lockWallets, [from, to]);
    if (locks.rowCount !== 2) {
      throw new AppError('from or to wallet does not exist', 404);
    }
  }

  private async executeMoneyMovement(
    client: PoolClient,
    amount: number,
    from: string,
    transferId: string,
    to: string,
  ): Promise<AppError | null> {
    const debitResult = await client.query(
      TRANSFER_QUERIES.debit,
      [amount, from]
    );

    if (debitResult.rowCount === 0) {
      await client.query(TRANSFER_QUERIES.decline, [transferId]);
      transfersDeclined.inc();
      logger.warn({
        transfer_id: transferId,
        from,
        to,
        amount: amount,
      }, 'transfer_declined_insufficient_funds');
      return new AppError('insufficient funds', 409, {
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
    return null;
  }
}
