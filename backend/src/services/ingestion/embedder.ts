// OpenAI official client for invoking embedding models
import OpenAI from 'openai';
// Validated environment variables
import { env } from '../../config/env.js';

// Structure describing resolved embedding provider configuration
interface EmbeddingConfig {
  client: OpenAI;
  model: string;
  isGemini: boolean;
}

// Client instance factory resolving Gemini or OpenAI embedding configuration
// returns: EmbeddingConfig | null
function getEmbeddingConfig(): EmbeddingConfig | null {
  const useGemini = env.LLM_PROVIDER === 'gemini' || (!env.OPENAI_API_KEY && Boolean(env.GEMINI_API_KEY));

  // 1. Google Gemini embedding via OpenAI-compatible endpoint
  if (useGemini && env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0) {
    return {
      client: new OpenAI({
        apiKey: env.GEMINI_API_KEY.trim(),
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
      model: env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
      isGemini: true,
    };
  }

  // 2. OpenAI embedding provider
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0 && !env.OPENAI_API_KEY.includes('YOUR_OPENAI_API_KEY')) {
    return {
      client: new OpenAI({ apiKey: env.OPENAI_API_KEY.trim() }),
      model: env.EMBEDDING_MODEL || 'text-embedding-3-small',
      isGemini: false,
    };
  }

  return null;
}

// Computes L2 Euclidean norm and normalizes a float vector to unit length
// returns: number[]
export function normalizeVector(vector: number[]): number[] {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSquares += vector[i] * vector[i];
  }

  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) return vector;

  const normalized: number[] = new Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = vector[i] / magnitude;
  }

  // normalized is an Array of Numbers with unit Euclidean length
  return normalized;
}

// Adapts vector dimension to target pgvector column dimension (1536) preserving unit cosine norm
// returns: number[]
export function adaptVectorDimension(vector: number[], targetDim: number = 1536): number[] {
  if (vector.length === targetDim) {
    return normalizeVector(vector);
  }

  if (vector.length < targetDim) {
    const padded = new Array(targetDim).fill(0);
    for (let i = 0; i < vector.length; i++) {
      padded[i] = vector[i];
    }
    return normalizeVector(padded);
  }

  return normalizeVector(vector.slice(0, targetDim));
}

// Test utility: Generates a deterministic normalized pseudo-embedding explicitly for offline unit tests
// returns: number[] 1536-dimensional unit float vector
export function generateTestMockEmbedding(text: string, dimensions: number = 1536): number[] {
  const vector: number[] = new Array(dimensions);

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  for (let i = 0; i < dimensions; i++) {
    const x = Math.sin(hash + i * 0.12345);
    vector[i] = x;
  }

  return normalizeVector(vector);
}

// Invokes embedding request with resilient fallback between Gemini embedding models
// returns: Promise<OpenAI.Embeddings.CreateEmbeddingResponse>
async function requestEmbeddingWithFallback(
  client: OpenAI,
  primaryModel: string,
  input: string | string[],
  isGemini: boolean
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  try {
    return await client.embeddings.create({ model: primaryModel, input });
  } catch (err) {
    if (!isGemini) throw err;
    const fallbackModel = primaryModel === 'gemini-embedding-001' ? 'text-embedding-004' : 'gemini-embedding-001';
    return await client.embeddings.create({ model: fallbackModel, input });
  }
}

// Generates a single vector embedding for a given text string
// returns: Promise<number[]> 1536-dimensional float vector
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getEmbeddingConfig();

  if (!config) {
    throw new Error('Vector embedding generation failed: Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured in backend/.env');
  }

  try {
    const response = await requestEmbeddingWithFallback(
      config.client,
      config.model,
      text.replace(/\n/g, ' '),
      config.isGemini
    );

    const rawVector = response.data[0].embedding;
    return adaptVectorDimension(rawVector, 1536);
  } catch (error) {
    throw new Error(`Embedding request failed (${config.model}): ${(error as Error).message}`);
  }
}

// Generates vector embeddings in controlled batches to prevent token overflow and rate limits
// returns: Promise<number[][]> Array of 1536-dimensional float vectors
export async function batchGenerateEmbeddings(
  texts: string[],
  batchSize: number = 32
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const config = getEmbeddingConfig();

  if (!config) {
    throw new Error('Batch vector embedding generation failed: Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured in backend/.env');
  }

  const allEmbeddings: number[][] = [];
  const effectiveBatchSize = config.isGemini ? Math.min(batchSize, 16) : batchSize;

  // Process texts in sequential batches
  for (let i = 0; i < texts.length; i += effectiveBatchSize) {
    const batchTexts = texts.slice(i, i + effectiveBatchSize).map((t) => t.replace(/\n/g, ' '));

    try {
      const response = await requestEmbeddingWithFallback(
        config.client,
        config.model,
        batchTexts,
        config.isGemini
      );

      // Sort results by index to preserve input order
      const sortedItems = response.data.sort((a, b) => a.index - b.index);
      for (const item of sortedItems) {
        allEmbeddings.push(adaptVectorDimension(item.embedding, 1536));
      }
    } catch (error) {
      throw new Error(`Batch embedding request failed on slice ${i} to ${i + effectiveBatchSize}: ${(error as Error).message}`);
    }
  }

  // allEmbeddings is an Array of Number Arrays with length matching texts.length
  return allEmbeddings;
}
