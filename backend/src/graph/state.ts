// Base message type from LangChain core
import { BaseMessage } from '@langchain/core/messages';
// Reranked candidate and hybrid search result interfaces
import { HybridSearchResult } from '../services/retrieval/hybridSearch.js';
import { RerankedCandidate } from '../services/retrieval/reranker.js';
// PII entity match interface from security service
import { PiiEntityMatch } from '../services/security/guardrails.js';

// TypeScript Concept: Interface
// Structure of an individual citation pointing to an exact evidence chunk
export interface CitationItem {
  citationTag: string;
  documentId: string;
  chunkId?: string;
  documentTitle?: string;
  pageNumber?: number | null;
  sectionHeading?: string | null;
  headingPath: string | null;
  snippet: string;
  sourceSnippet?: string;
  claim?: string;
  isEntailed?: boolean;
  relevanceScore?: number;
}

// TypeScript Concept: State Definition
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
  groundingScore?: number;
  abstentionFlag: boolean;
  abstentionReason?: string;
  streamTokenCallback?: (token: string) => void;
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
    streamTokenCallback?: (token: string) => void;
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
    groundingScore: 1.0,
    abstentionFlag: false,
    streamTokenCallback: options.streamTokenCallback,
    executionMetrics: {},
  };
}
