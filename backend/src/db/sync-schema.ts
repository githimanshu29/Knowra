// Direct non-interactive schema synchronization script
import { pool } from './index.js';

// Executes DDL updates directly on PostgreSQL without requiring interactive TTY prompt
// returns: Promise<void>
async function syncDatabaseSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Ensuring pgvector extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

    console.log('Adding tenant_id column to chunks table if not exists...');
    await client.query(`
      ALTER TABLE "chunks" 
      ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
    `);

    console.log('Database schema synchronization complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

syncDatabaseSchema().catch((err) => {
  console.error('Schema sync failed:', err);
  process.exit(1);
});
