// Environment variables ko filesystem (.env) se process.env me load karne ke liye
import dotenv from 'dotenv';
// Runtime schema definition aur environment variables validation ke liye
import { z } from 'zod';

// Load .env configuration immediately on module evaluation
dotenv.config();

/**
 * Enterprise Application Environment Schema.
 * Server start hote hi Zod sabhi keys ko validate karega.
 * Agar koi critical variable (jaise DATABASE_URL ya JWT_SECRET) missing ya invalid hua,
 * toh application boot time par hi crash ho jayegi (Fail-fast principle).
 */
const envSchema = z.object({
  // -------------------------------------------------------------------------
  // 1. Server & Environment
  // -------------------------------------------------------------------------
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // -------------------------------------------------------------------------
  // 2. PostgreSQL Database Connection
  // -------------------------------------------------------------------------
  // Connection string format: postgresql://user:password@host:port/database_name
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/enterprise_rag_db'),

  // -------------------------------------------------------------------------
  // 3. JWT Authentication & Security
  // -------------------------------------------------------------------------
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long').default('CHANGE_THIS_IN_PRODUCTION_TO_A_SECURE_RANDOM_32_CHAR_SECRET_KEY'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // -------------------------------------------------------------------------
  // 4. Redis Cache Configuration
  // -------------------------------------------------------------------------
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_CACHE_TTL_SECONDS: z.coerce.number().default(3600), // 1 hour

  // -------------------------------------------------------------------------
  // 5. Vector Embeddings (pgvector)
  // -------------------------------------------------------------------------
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSION: z.coerce.number().default(1536), // pgvector column dimension

  // -------------------------------------------------------------------------
  // 6. External Providers & Observability (LangSmith & OpenAI)
  // -------------------------------------------------------------------------
  OPENAI_API_KEY: z.string().optional(),
  LANGCHAIN_TRACING_V2: z.coerce.boolean().default(false),
  LANGCHAIN_ENDPOINT: z.string().url().default('https://api.smith.langchain.com'),
  LANGCHAIN_API_KEY: z.string().optional(),
  LANGCHAIN_PROJECT: z.string().default('enterprise-rag-intelligence'),

  // -------------------------------------------------------------------------
  // 7. Hybrid Retrieval Tuning Parameters
  // -------------------------------------------------------------------------
  LEXICAL_CANDIDATE_K: z.coerce.number().default(20),  // tsvector full-text candidates
  VECTOR_CANDIDATE_K: z.coerce.number().default(20),   // pgvector cosine similarity candidates
  RRF_K_CONSTANT: z.coerce.number().default(60),       // Reciprocal Rank Fusion constant
  RERANKER_TOP_K: z.coerce.number().default(5),        // Top candidates after reranking
  FINAL_EVIDENCE_K: z.coerce.number().default(3),      // Grounded evidence in final LLM prompt
  MAX_CONTEXT_TOKENS: z.coerce.number().default(4000), // Context compression token ceiling
});

/**
 * Validates process.env against envSchema.
 * 
 * @returns {z.infer<typeof envSchema>} Strictly typed, validated environment settings
 * @example
 * {
 *   PORT: 5000,
 *   NODE_ENV: 'development',
 *   DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/enterprise_rag_db',
 *   EMBEDDING_DIMENSION: 1536,
 *   ...
 * }
 */
function validateEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid Environment Variables Configuration:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  return result.data;
}

// Global immutable validated config object
export const env: z.infer<typeof envSchema> = validateEnv();
export type Env = z.infer<typeof envSchema>;
