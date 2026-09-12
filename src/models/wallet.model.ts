export interface WalletCreateInput {
    user_id: string,
}

export interface Wallet {
    id: string,
    user_id: string,
    balance: number, // in paise
    status: string,
    created_at: string
}