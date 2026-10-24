// Base message type from LangChain core
import { BaseMessage } from '@langchain/core/messages';
// Reranked candidate and hybrid search result interfaces
import { HybridSearchResult } from '../services/retrieval/hybridSearch.js';
import { RerankedCandidate } from '../services/retrieval/reranker.js';

// TypeScript Concept: Interface
// Structure of an individual citation pointing to an exact evidence chunk
export interface CitationItem {
  citationTag: string;
  documentId: string;
  headingPath: string | null;
  snippet: string;
}
// PII entity match interface from security service
import { PiiEntityMatch } from '../services/security/guardrails.js';

// TypeScript Concept: Annotation / State Definition
// Complete state maintained throughout the LangGraph agent execution lifecycle
export interface KnowraAgentState {
  messages: BaseMessage[];
  query: string;
  tenantId: string;
  userId?: string;
  roleIds?: string[];
  isSuperAdmin?: boolean;
  isConversationalOnly?: boolean;
  isSecurityFlagged?: boolean;
  securityViolationReason?: string;
  piiEntitiesDetected?: PiiEntityMatch[];
  retrievedCandidates: HybridSearchResult[];
  rerankedEvidence: RerankedCandidate[];
  assembledContext: string;
  generatedAnswer: string;
  citations: CitationItem[];
  abstentionFlag: boolean;
  abstentionReason?: string;
  executionMetrics: {
    retrievalDurationMs?: number;
    rerankerDurationMs?: number;
    generationDurationMs?: number;
    verificationDurationMs?: number;
    totalDurationMs?: number;
  };
}

// Creates an initial clean state object for a new user query
// returns: KnowraAgentState
export function createInitialState(
  query: string,
  tenantId: string,
  options: {
    userId?: string;
    roleIds?: string[];
    isSuperAdmin?: boolean;
    messages?: BaseMessage[];
  } = {}
): KnowraAgentState {
  return {
    messages: options.messages || [],
    query,
    tenantId,
    userId: options.userId,
    roleIds: options.roleIds,
    isSuperAdmin: options.isSuperAdmin || false,
    isConversationalOnly: false,
    isSecurityFlagged: false,
    piiEntitiesDetected: [],
    retrievedCandidates: [],
    rerankedEvidence: [],
    assembledContext: '',
    generatedAnswer: '',
    citations: [],
    abstentionFlag: false,
    executionMetrics: {},
  };
}
