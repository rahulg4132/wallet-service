import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class TransferCreateInput {
  @IsString()
  @IsNotEmpty()
  from!: string;

  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsNumber()
  @IsNotEmpty()
  amount!: number;

  @IsNumber()
  @IsNotEmpty()
  idempotencyKey!: string;
}

export type TransferStatus = 'in_progress' | 'completed' | 'declined';

export interface Transfer {
  id: string;
  idempotency_key: string;
  request_hash: string;
  from_wallet: string;
  to_wallet: string;
  amount: number;
  status: TransferStatus;
  created_at: string;
}

export interface TransferResponse {
  id: string;
  from_wallet: string;
  to_wallet: string;
  amount: number;
  status: TransferStatus;
}