// Direct schema migration script for PostgreSQL and pgvector
import { sql } from 'drizzle-orm';
// Main database client and pool close helper
import { closeDatabaseConnection, db } from './index.js';

// Executes DDL statements safely with IF NOT EXISTS guards
// returns: Promise<void>
async function migrateSchema(): Promise<void> {
  console.log('Applying database schema updates...');

  // Ensure pgvector extension is active
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);

  // Add embedding model tracking column to chunks table
  await db.execute(sql`
    ALTER TABLE chunks 
    ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small';
  `);

  // Add embedding dimension tracking column to chunks table
  await db.execute(sql`
    ALTER TABLE chunks 
    ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER NOT NULL DEFAULT 1536;
  `);

  // Create HNSW cosine vector index for fast approximate nearest neighbor search
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw 
    ON chunks USING hnsw (embedding vector_cosine_ops);
  `);

  // Create multi-turn conversations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  // Create conversation messages table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      citations JSONB,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  console.log('Database schema successfully synchronized with pgvector HNSW index!');
  await closeDatabaseConnection();
}

migrateSchema().catch((err) => {
  console.error('Schema migration failed:', err);
  process.exit(1);
});
