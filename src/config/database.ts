import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { migrate } from "postgres-migrations"
import { logger } from './logger.js';

export const pool = new Pool({
  host: 'localhost',
  port: Number(5432),
  user: 'postgres',
  password: 'password',
  database: 'wallet_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const initDatabase = async (): Promise<void> => {

  const isConnected = await connectDatabase();

  if (!isConnected) {
    logger.error('Server failed to start...');
    logger.error('No database connection...');
    process.exit(1);
  }

  await runMigrations();
};

const connectDatabase = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    client.release();
    logger.info('Connected to PostgreSQL');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'PostgreSQL connection failed');
    return false;
  }
};

const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    logger.info('Running database migrations...');
    await migrate({ client }, "./migrations");
    logger.info('Migrations completed successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Database migration failed');
    throw error;
  } finally {
    client.release();
  }
};

export const queryDatabase = async <T extends QueryResultRow>(text: string, params?: unknown[]) => {
  const result = await pool.query<T>(text, params);
  return result;
};

export default pool;
