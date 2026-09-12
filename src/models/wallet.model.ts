import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class WalletCreateInput {
  @IsString()
  @IsNotEmpty()
  user_id!: string;
}

export class WalletCreditInput {
  @IsNumber()
  @IsNotEmpty()
  amount_paise!: number;
}

export interface Wallet {
  id: string,
  user_id: string,
  balance: number, // in paise
  created_at: string
}