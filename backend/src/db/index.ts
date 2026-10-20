// PostgreSQL native non-blocking connection pool handle karne ke liye
import pg from 'pg';
// PostgreSQL pool ko wrap karke type-safe Drizzle ORM client create karne ke liye
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
// Validated database connection URL lene ke liye
import { env } from '../config/env.js';
// All Drizzle ORM table schemas & relational mappings
import * as schema from './schema/index.js';

const { Pool } = pg;

/**
 * PostgreSQL Connection Pool Configuration.
 * Har incoming API request ke liye fresh connection open karne ke bajaye
 * reusable connections ka pool maintain karta hai (High Performance).
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,                          // Maximum 20 simultaneous connections
  idleTimeoutMillis: 30000,         // 30 seconds idle rehne par connection close karega
  connectionTimeoutMillis: 5000,     // 5 seconds me connect na hone par timeout error dega
});

// Pool error event listener (unexpected idle client errors capture karne ke liye)
pool.on('error', (err: Error) => {
  console.error('❌ Unexpected idle PostgreSQL client error:', err.message);
});

/**
 * Type-Safe Drizzle ORM Instance with Relational Query API.
 * Poore application me database queries, transactions, aur vector searches
 * isi `db` instance ke through execute hongi.
 */
export const db = drizzle(pool, {
  schema,
  logger: env.NODE_ENV === 'development', // Development me generated SQL queries console me log hongi
});

export type DbClient = NodePgDatabase<typeof schema>;

/**
 * Checks PostgreSQL server connectivity and health.
 * Database server reachable hai ya nahi ye verify karta hai.
 * 
 * @returns {Promise<boolean>} True agar database connected hai aur query execute hui, false otherwise
 * @example
 * const isHealthy = await checkDatabaseConnection();
 * // returns true
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      // Simple SELECT 1 query execute karke health check karte hain
      // Result format: { rows: [ { '?column?': 1 } ], rowCount: 1 }
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release(); // Connection wapas pool me release karte hain
    }
  } catch (error) {
    console.error('❌ PostgreSQL connection check failed:', (error as Error).message);
    return false;
  }
}

/**
 * Gracefully closes all active connections in the PostgreSQL pool.
 * Server shutdown (SIGTERM / SIGINT) ke waqt memory leaks prevent karta hai.
 * 
 * @returns {Promise<void>}
 * @example
 * await closeDatabaseConnection();
 */
export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
  console.log('🔌 PostgreSQL connection pool closed gracefully');
}
