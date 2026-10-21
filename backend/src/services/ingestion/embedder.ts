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

// Generates a deterministic normalized pseudo-embedding for testing or offline environments
// returns: number[] 1536-dimensional unit float vector
export function generateDeterministicMockEmbedding(text: string, dimensions: number = 1536): number[] {
  const vector: number[] = new Array(dimensions);

  // Seed values deterministically from text characters
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  for (let i = 0; i < dimensions; i++) {
    // Generate pseudo-random distribution between -1 and 1
    const x = Math.sin(hash + i * 0.12345);
    vector[i] = x;
  }

  return normalizeVector(vector);
}

// Generates a single vector embedding for a given text string
// returns: Promise<number[]> 1536-dimensional float vector
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();

  if (!client) {
    // Fallback to deterministic pseudo-embedding when api key is not configured
    return generateDeterministicMockEmbedding(text, env.EMBEDDING_DIMENSION);
  }

  try {
    const response = await client.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: text.replace(/\n/g, ' '),
    });

    // response is an OpenAI EmbeddingResponse object
    const rawVector = response.data[0].embedding;
    return normalizeVector(rawVector);
  } catch (error) {
    console.warn('OpenAI embedding call failed, falling back to deterministic vector:', (error as Error).message);
    return generateDeterministicMockEmbedding(text, env.EMBEDDING_DIMENSION);
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
  const allEmbeddings: number[][] = [];

  // If no OpenAI key configured process via deterministic mock generator
  if (!client) {
    for (const text of texts) {
      allEmbeddings.push(generateDeterministicMockEmbedding(text, env.EMBEDDING_DIMENSION));
    }
    // allEmbeddings is an Array of 1536-dimensional number arrays
    return allEmbeddings;
  }

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
      console.warn(`Batch embedding error on slice ${i} to ${i + batchSize}, using fallback:`, (error as Error).message);
      for (const text of batchTexts) {
        allEmbeddings.push(generateDeterministicMockEmbedding(text, env.EMBEDDING_DIMENSION));
      }
    }
  }

  // allEmbeddings is an Array of Number Arrays with length matching texts.length
  return allEmbeddings;
}
