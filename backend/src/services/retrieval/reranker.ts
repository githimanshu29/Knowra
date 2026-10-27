// Environment variables for reranking thresholds and external API keys
import { env } from '../../config/env.js';
// HybridSearchResult type from hybrid search engine
import { HybridSearchResult } from './hybridSearch.js';

// TypeScript Concept: Interface
// Represents an individually scored candidate chunk after cross-encoder evaluation
export interface RerankedCandidate {
  id: string;
  tenantId: string;
  documentId: string;
  versionId: string;
  parentChunkId: string | null;
  chunkIndex: number;
  content: string;
  microContent: string;
  tokenCount: number;
  pageNumber: number | null;
  sectionHeading: string | null;
  headingPath: string | null;
  chunkStrategy: string;
  rrfScore: number;
  rerankScore: number;
  citationTag: string;
}

// TypeScript Concept: Interface
// Represents final compressed context payload ready for injection into LLM prompts
export interface CompressedContext {
  formattedContext: string;
  evidenceChunks: RerankedCandidate[];
  totalTokens: number;
  deduplicatedParentCount: number;
}

// Tokenizes text into lowercase alphanumeric words
// returns: string[]
function extractWords(text: string): string[] {
  if (!text) return [];
  const words = text.toLowerCase().match(/\b[a-z0-9]+\b/g);
  return words ? words : [];
}

// Calculates term coverage, bigram phrase match, and heading context heuristic score
// returns: number
function calculateCrossScore(query: string, content: string, headingPath: string | null): number {
  const queryTokens = extractWords(query);
  if (queryTokens.length === 0) return 0.5;

  const contentLower = content.toLowerCase();
  const headingLower = headingPath ? headingPath.toLowerCase() : '';

  // 1. Compute single-word term coverage
  let matchedTokens = 0;
  for (const token of queryTokens) {
    if (contentLower.includes(token) || headingLower.includes(token)) {
      matchedTokens++;
    }
  }
  const termCoverage = matchedTokens / queryTokens.length;

  // 2. Compute bigram phrase match
  let bigramMatches = 0;
  let totalBigrams = 0;
  for (let i = 0; i < queryTokens.length - 1; i++) {
    totalBigrams++;
    const bigram = `${queryTokens[i]} ${queryTokens[i + 1]}`;
    if (contentLower.includes(bigram) || headingLower.includes(bigram)) {
      bigramMatches++;
    }
  }
  const bigramScore = totalBigrams > 0 ? bigramMatches / totalBigrams : termCoverage;

  // 3. Compute heading path context relevance bonus
  let headingBonus = 0;
  if (headingPath) {
    for (const token of queryTokens) {
      if (headingLower.includes(token)) {
        headingBonus += 0.05;
      }
    }
  }

  // 4. Weighted combination bounded between 0 and 1
  const rawScore = termCoverage * 0.55 + bigramScore * 0.35 + Math.min(0.1, headingBonus);
  return Math.min(1.0, Math.max(0.01, rawScore));
}

// Evaluates candidate chunks using Cohere API or high-precision cross-scoring fallback
// returns: Promise<RerankedCandidate[]>
export async function rerankCandidates(
  query: string,
  candidates: HybridSearchResult[],
  topK: number = env.RERANKER_TOP_K
): Promise<RerankedCandidate[]> {
  if (!candidates || candidates.length === 0) return [];

  // Cohere Rerank API integration when COHERE_API_KEY is configured
  if (env.COHERE_API_KEY) {
    try {
      const documentsPayload = candidates.map((c) => {
        return c.parentChunk ? c.parentChunk.content : c.content;
      });

      const response = await fetch('https://api.cohere.com/v2/rerank', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.COHERE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'rerank-v3.5',
          query,
          documents: documentsPayload,
          top_n: topK,
        }),
      });

      if (response.ok) {
        // cohereData is the JSON response Object from Cohere Rerank API
        const cohereData = (await response.json()) as {
          results: Array<{ index: number; relevance_score: number }>;
        };

        const rerankedList: RerankedCandidate[] = [];
        for (let i = 0; i < cohereData.results.length; i++) {
          const item = cohereData.results[i];
          const candidate = candidates[item.index];
          const effectiveContent = candidate.parentChunk ? candidate.parentChunk.content : candidate.content;
          const effectiveTokens = candidate.parentChunk ? candidate.parentChunk.tokenCount : candidate.tokenCount;

          rerankedList.push({
            id: candidate.id,
            tenantId: candidate.tenantId,
            documentId: candidate.documentId,
            versionId: candidate.versionId,
            parentChunkId: candidate.parentChunkId,
            chunkIndex: candidate.chunkIndex,
            content: effectiveContent,
            microContent: candidate.content,
            tokenCount: effectiveTokens,
            pageNumber: candidate.pageNumber,
            sectionHeading: candidate.sectionHeading,
            headingPath: candidate.headingPath,
            chunkStrategy: candidate.chunkStrategy,
            rrfScore: candidate.rrfScore,
            rerankScore: item.relevance_score,
            citationTag: `[Evidence ${i + 1} | Section: ${candidate.headingPath ?? 'General'}]`,
          });
        }

        return rerankedList;
      } else {
        console.warn(`Cohere reranking returned non-ok status: ${response.status}. Using lexical overlap heuristic.`);
      }
    } catch (error) {
      console.warn('Cohere rerank failed, using lexical overlap heuristic reranking fallback:', (error as Error).message);
    }
  }

  // Heuristic lexical alignment and bigram overlap reranker
  const scoredList: RerankedCandidate[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const effectiveContent = c.parentChunk ? c.parentChunk.content : c.content;
    const effectiveTokens = c.parentChunk ? c.parentChunk.tokenCount : c.tokenCount;

    // Cross-score calculated against both micro-chunk and macro-parent context
    const microScore = calculateCrossScore(query, c.content, c.headingPath);
    const macroScore = c.parentChunk ? calculateCrossScore(query, c.parentChunk.content, c.parentChunk.headingPath) : microScore;
    const combinedScore = Math.max(microScore, macroScore * 0.95);

    scoredList.push({
      id: c.id,
      tenantId: c.tenantId,
      documentId: c.documentId,
      versionId: c.versionId,
      parentChunkId: c.parentChunkId,
      chunkIndex: c.chunkIndex,
      content: effectiveContent,
      microContent: c.content,
      tokenCount: effectiveTokens,
      pageNumber: c.pageNumber,
      sectionHeading: c.sectionHeading,
      headingPath: c.headingPath,
      chunkStrategy: c.chunkStrategy,
      rrfScore: c.rrfScore,
      rerankScore: Number(combinedScore.toFixed(4)),
      citationTag: `[Evidence | Section: ${c.headingPath ?? 'General'}]`,
    });
  }

  // Sort candidates descending by cross-encoder score, breaking ties with RRF score
  scoredList.sort((a, b) => {
    if (b.rerankScore !== a.rerankScore) {
      return b.rerankScore - a.rerankScore;
    }
    return b.rrfScore - a.rrfScore;
  });

  const topResults = scoredList.slice(0, topK);
  for (let idx = 0; idx < topResults.length; idx++) {
    topResults[idx].citationTag = `[Evidence ${idx + 1} | Section: ${topResults[idx].headingPath ?? 'General'}]`;
  }

  // returns: Promise<RerankedCandidate[]>
  return topResults;
}

// Deduplicates macro parents and compresses context within maximum token ceiling
// returns: CompressedContext
export function compressAndAssembleContext(
  rerankedChunks: RerankedCandidate[],
  maxTokens: number = env.MAX_CONTEXT_TOKENS
): CompressedContext {
  const seenParentIds = new Set<string>();
  const evidenceChunks: RerankedCandidate[] = [];
  let totalTokens = 0;
  let deduplicatedParentCount = 0;

  for (const chunk of rerankedChunks) {
    // If multiple child chunks point to the same parent macro chunk, preserve only the highest-scoring occurrence
    if (chunk.parentChunkId) {
      if (seenParentIds.has(chunk.parentChunkId)) {
        deduplicatedParentCount++;
        continue;
      }
      seenParentIds.add(chunk.parentChunkId);
    }

    // Stop adding chunks if next chunk would exceed token budget
    if (totalTokens + chunk.tokenCount > maxTokens && evidenceChunks.length > 0) {
      break;
    }

    evidenceChunks.push(chunk);
    totalTokens += chunk.tokenCount;
  }

  // Format distinct evidence blocks for LLM prompt assembly
  const contextBlocks = evidenceChunks.map((chunk, idx) => {
    const citation = `[Evidence ${idx + 1}: Document ${chunk.documentId} | Section: ${chunk.headingPath ?? 'General'}]`;
    return `${citation}\n${chunk.content}`;
  });

  const formattedContext = contextBlocks.join('\n\n---\n\n');

  // returns: CompressedContext
  return {
    formattedContext,
    evidenceChunks,
    totalTokens,
    deduplicatedParentCount,
  };
}
