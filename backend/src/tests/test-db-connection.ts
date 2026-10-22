// Script to test PostgreSQL and pgvector connectivity directly
import { env } from '../config/env.js';
import { pool, checkDatabaseConnection } from '../db/index.js';

// Masks sensitive credentials in connection string for safe console logging
// returns: string
function maskConnectionString(uri: string): string {
  try {
    const url = new URL(uri);
    const maskedPass = url.password ? '****' : '';
    return `${url.protocol}//${url.username}:${maskedPass}@${url.host}${url.pathname}${url.search}`;
  } catch {
    return uri.slice(0, 20) + '...';
  }
}

// Executes connection verification, auto-enables pgvector, and checks table schema
// returns: Promise<void>
async function runDatabaseDiagnostic(): Promise<void> {
  console.log('=====================================================');
  console.log('KNOWRA DATABASE CONNECTIVITY DIAGNOSTIC');
  console.log('=====================================================\n');

  console.log('Loaded DATABASE_URL from .env:');
  console.log(`  Target: ${maskConnectionString(env.DATABASE_URL)}\n`);

  if (env.DATABASE_URL.includes('neon.tech')) {
    console.log('Detected Neon Cloud PostgreSQL Provider (SSL enabled).\n');
  }

  console.log('[1/3] Testing TCP and Authentication handshake...');
  const isHealthy = await checkDatabaseConnection();

  if (!isHealthy) {
    console.error('\nFAILED to connect to PostgreSQL database.');
    process.exit(1);
  }

  console.log('\n[2/3] Querying PostgreSQL Engine Version & Enabling pgvector...');
  const client = await pool.connect();
  try {
    const versionRes = await client.query('SELECT version();');
    console.log(`  Engine: ${versionRes.rows[0].version}`);

    // Auto-create vector extension if not present
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    const extRes = await client.query("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';");
    console.log(`  pgvector extension is ACTIVE (Version: ${extRes.rows[0]?.extversion || 'enabled'})!\n`);

    console.log('[3/3] Checking if application tables exist...');
    const tableCheck = await client.query("SELECT to_regclass('public.tenants') AS table_exists;");
    const hasTenantsTable = Boolean(tableCheck.rows[0]?.table_exists);

    if (hasTenantsTable) {
      console.log('  Tables exist in database! Ready for ingestion test.');
    } else {
      console.warn('  Tables (tenants, documents, chunks) are NOT YET CREATED.');
      console.warn('  Run command: npx drizzle-kit push --force');
    }

    console.log('\n=====================================================');
    console.log('DIAGNOSTIC COMPLETED');
    console.log('=====================================================');
  } finally {
    client.release();
    await pool.end();
  }
}

runDatabaseDiagnostic().catch((err) => {
  console.error('Diagnostic crashed:', err);
  process.exit(1);
});
