// Environment variables loader from filesystem
import dotenv from 'dotenv';
// Zod runtime schema validation library
import { z } from 'zod';

// Load dot env configuration immediately on module evaluation
dotenv.config();

// TypeScript Concept: Zod Runtime Schema Validation
// Enforces strict typing and fail-fast crash semantics on application boot
const envSchema = z
  .object({
    // Server and Environment
    PORT: z.coerce.number().default(5000),
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),

    // PostgreSQL Database Connection
    DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/enterprise_rag_db'),

    // JWT Authentication and Security
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long').default('replace_with_a_super_secret_key_at_least_32_characters_long'),
    JWT_EXPIRES_IN: z.string().default('24h'),

    // Redis Cache Configuration
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    REDIS_CACHE_TTL_SECONDS: z.coerce.number().default(3600),

    // Vector Embeddings
    EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
    EMBEDDING_DIMENSION: z.coerce.number().default(1536),

    // External Providers and Observability
    OPENAI_API_KEY: z.string().optional(),
    COHERE_API_KEY: z.string().optional(),
    LANGCHAIN_TRACING_V2: z.coerce.boolean().default(false),
    LANGCHAIN_ENDPOINT: z.string().url().default('https://api.smith.langchain.com'),
    LANGCHAIN_API_KEY: z.string().optional(),
    LANGCHAIN_PROJECT: z.string().default('enterprise-rag-intelligence'),

    // Hybrid Retrieval Tuning Parameters
    LEXICAL_CANDIDATE_K: z.coerce.number().default(20),
    VECTOR_CANDIDATE_K: z.coerce.number().default(20),
    RRF_K_CONSTANT: z.coerce.number().default(60),
    RERANKER_TOP_K: z.coerce.number().default(5),
    FINAL_EVIDENCE_K: z.coerce.number().default(3),
    MAX_CONTEXT_TOKENS: z.coerce.number().default(4000),
  })
  .refine(
    (data) => {
      // Production security guard: reject placeholder secrets
      if (data.NODE_ENV === 'production') {
        const lowerSecret = data.JWT_SECRET.toLowerCase();
        if (
          lowerSecret.includes('replace_with') ||
          lowerSecret.includes('change_this') ||
          lowerSecret.includes('default')
        ) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'JWT_SECRET must be replaced with a secure random key in production environments',
      path: ['JWT_SECRET'],
    }
  )
  .refine(
    (data) => {
      // Production security guard: reject localhost database url
      if (data.NODE_ENV === 'production') {
        if (data.DATABASE_URL.includes('localhost') || data.DATABASE_URL.includes('127.0.0.1')) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'DATABASE_URL cannot point to localhost in production environments',
      path: ['DATABASE_URL'],
    }
  );

// Validates process.env against envSchema
// returns: z.infer<typeof envSchema>
function validateEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid Environment Variables Configuration:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  return result.data;
}

// Global immutable validated configuration object
export const env: z.infer<typeof envSchema> = validateEnv();
export type Env = z.infer<typeof envSchema>;
