// PostgreSQL native non-blocking connection pool handle karne ke liye
import pg from 'pg';
// PostgreSQL pool ko wrap karke type-safe Drizzle ORM client create karne ke liye
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
// Validated database connection URL lene ke liye
import { env } from '../config/env.js';
// All Drizzle ORM table schemas and relational mappings
import * as schema from './schema/index.js';

const { Pool } = pg;

// TypeScript Concept: Dynamic SSL Configuration for Cloud Databases
// Neon, Supabase, and AWS RDS enforce TLS encryption
const requiresSsl =
  env.DATABASE_URL.includes('neon.tech') ||
  env.DATABASE_URL.includes('supabase') ||
  env.DATABASE_URL.includes('sslmode=require') ||
  env.DATABASE_URL.includes('ssl=true') ||
  env.DATABASE_URL.includes('render.com') ||
  env.DATABASE_URL.includes('aivencloud.com');

// PostgreSQL connection pool configuration
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

// Pool error event listener
pool.on('error', (err: Error) => {
  console.error('Unexpected idle PostgreSQL client error:', err.message);
});

// Type-Safe Drizzle ORM Instance with Relational Query API
export const db = drizzle(pool, {
  schema,
  logger: env.NODE_ENV === 'development',
});

export type DbClient = NodePgDatabase<typeof schema>;

// Checks PostgreSQL server connectivity and health
// returns: Promise<boolean>
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      // Simple SELECT 1 query execute karke health check karte hain
      await client.query('SELECT 1');
      console.log('✅✅✅✅PostgreSQL connection success');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌❌❌PostgreSQL connection check failed:', (error as Error).message);
    return false;
  }
}

// Gracefully closes all active connections in the PostgreSQL pool
// returns: Promise<void>
export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
  console.log('PostgreSQL connection pool closed gracefully');
}
