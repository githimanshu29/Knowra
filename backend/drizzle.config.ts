// Drizzle Kit type-safe configuration helper import
import { defineConfig } from 'drizzle-kit';
// Environment variables load karne ke liye taaki migration DB credentials access kar sake
import dotenv from 'dotenv';

// .env load karna
dotenv.config();

/**
 * Drizzle ORM Configuration for PostgreSQL & pgvector schema migrations.
 * Command: `npm run db:generate` / `npm run db:push`
 */
export default defineConfig({
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/enterprise_rag_db',
  },
  verbose: true,
  strict: true,
});
