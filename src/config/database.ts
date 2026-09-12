import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {migrate} from "postgres-migrations"

const pool = new Pool({
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
    console.error('Server failed to start...');
    console.error('No database connection...');
    process.exit(1);
  }
  
  await runMigrations();
};

const connectDatabase = async (): Promise<boolean> => {
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

const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');
    await migrate({ client }, "./migrations");
    console.log('Migrations completed successfully.');
  } catch (error) {
    console.error('Database migration failed:', error);
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
