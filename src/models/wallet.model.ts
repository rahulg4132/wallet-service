import { IsString, IsNotEmpty } from 'class-validator';

export class WalletCreateInput {
  @IsString()
  @IsNotEmpty()
  user_id!: string;
}

export interface Wallet {
  id: string,
  user_id: string,
  balance: number, // in paise
  created_at: string
}