// Knowra agent state type
import { KnowraAgentState } from '../state.js';
// Hybrid search engine function
import { hybridSearch } from '../../services/retrieval/hybridSearch.js';
// Environment variables
import { env } from '../../config/env.js';

// Node 2: Retrieves candidate chunks across dense vector and sparse lexical branches
// returns: Promise<Partial<KnowraAgentState>>
export async function retrievalNode(state: KnowraAgentState): Promise<Partial<KnowraAgentState>> {
  if (state.isConversationalOnly) {
    return { retrievedCandidates: [] };
  }

  const startTime = Date.now();

  // candidates is an Array of HybridSearchResult objects returned by hybridSearch
  const candidates = await hybridSearch({
    query: state.query,
    tenantId: state.tenantId,
    userId: state.userId,
    roleIds: state.roleIds,
    isSuperAdmin: state.isSuperAdmin,
    documentId: state.documentId,
    limit: env.VECTOR_CANDIDATE_K,
  });

  const durationMs = Date.now() - startTime;

  // returns: Partial<KnowraAgentState>
  return {
    retrievedCandidates: candidates,
    executionMetrics: {
      ...state.executionMetrics,
      retrievalDurationMs: durationMs,
    },
  };
}
