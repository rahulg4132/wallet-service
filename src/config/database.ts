import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: Number(5432),
  user: 'postgres',
  password: 'password',
  database: 'wallet_service',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const connectDatabase = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    client.release();
    console.log('Connected to PostgreSQL');
    return true;
  } catch (error) {
    console.error('PostgreSQL connection failed:', error instanceof Error ? error.message : error);
    return false;
  }
};

export const queryDatabase = async <T extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) => {
  const result = await pool.query<T>(text, params);
  return result;
};

export default pool;
