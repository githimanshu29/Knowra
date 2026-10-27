// OpenAI official client for invoking embedding models
import OpenAI from 'openai';
// Validated environment variables
import { env } from '../../config/env.js';

// TypeScript Concept: Singleton Client Instance
// Maintains a single authenticated OpenAI instance across the entire application lifecycle
let openaiClient: OpenAI | null = null;

// Initializes or returns the shared OpenAI client instance
// returns: OpenAI | null
function getOpenAIClient(): OpenAI | null {
  if (openaiClient) return openaiClient;

  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0 && !env.OPENAI_API_KEY.includes('YOUR_OPENAI_API_KEY')) {
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    return openaiClient;
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

// Generates a single vector embedding for a given text string using OpenAI API
// returns: Promise<number[]> 1536-dimensional float vector
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();

  if (!client) {
    throw new Error('Vector embedding generation failed: OPENAI_API_KEY is not configured');
  }

  try {
    const response = await client.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: text.replace(/\n/g, ' '),
    });

    const rawVector = response.data[0].embedding;
    return normalizeVector(rawVector);
  } catch (error) {
    throw new Error(`OpenAI embedding request failed: ${(error as Error).message}`);
  }
}

// Generates vector embeddings in controlled batches to prevent token overflow and rate limits
// returns: Promise<number[][]> Array of 1536-dimensional float vectors
export async function batchGenerateEmbeddings(
  texts: string[],
  batchSize: number = 64
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getOpenAIClient();

  if (!client) {
    throw new Error('Batch vector embedding generation failed: OPENAI_API_KEY is not configured');
  }

  const allEmbeddings: number[][] = [];

  // Process texts in sequential batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize).map((t) => t.replace(/\n/g, ' '));

    try {
      const response = await client.embeddings.create({
        model: env.EMBEDDING_MODEL,
        input: batchTexts,
      });

      // Sort results by index to preserve input order
      const sortedItems = response.data.sort((a, b) => a.index - b.index);
      for (const item of sortedItems) {
        allEmbeddings.push(normalizeVector(item.embedding));
      }
    } catch (error) {
      throw new Error(`Batch embedding request failed on slice ${i} to ${i + batchSize}: ${(error as Error).message}`);
    }
  }

  // allEmbeddings is an Array of Number Arrays with length matching texts.length
  return allEmbeddings;
}
