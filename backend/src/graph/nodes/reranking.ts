// Knowra agent state type
import { KnowraAgentState } from '../state.js';
// Cross-encoder reranker and context compression functions
import { compressAndAssembleContext, rerankCandidates } from '../../services/retrieval/reranker.js';
// Environment variables
import { env } from '../../config/env.js';

// Node 3: Cross-encoder reranking, parent deduplication, and context compression
// returns: Promise<Partial<KnowraAgentState>>
export async function rerankingNode(state: KnowraAgentState): Promise<Partial<KnowraAgentState>> {
  if (state.isConversationalOnly || state.retrievedCandidates.length === 0) {
    return {
      rerankedEvidence: [],
      assembledContext: '',
    };
  }

  const startTime = Date.now();

  // reranked is an Array of RerankedCandidate objects
  const reranked = await rerankCandidates(state.query, state.retrievedCandidates, env.RERANKER_TOP_K);

  // compressed is a CompressedContext object containing formattedContext and evidenceChunks
  const compressed = compressAndAssembleContext(reranked, env.MAX_CONTEXT_TOKENS);

  const durationMs = Date.now() - startTime;

  // returns: Partial<KnowraAgentState>
  return {
    rerankedEvidence: compressed.evidenceChunks,
    assembledContext: compressed.formattedContext,
    executionMetrics: {
      ...state.executionMetrics,
      rerankerDurationMs: durationMs,
    },
  };
}
