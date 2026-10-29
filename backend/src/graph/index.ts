// LangChain Core message type
import { BaseMessage } from '@langchain/core/messages';
// LangGraph StateGraph, START, END, and Annotation helpers
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
// State definition and interfaces
import { CitationItem, KnowraAgentState } from './state.js';
// HybridSearchResult and RerankedCandidate types
import { HybridSearchResult } from '../services/retrieval/hybridSearch.js';
import { RerankedCandidate } from '../services/retrieval/reranker.js';
// Graph node executors
import { queryAnalysisNode } from './nodes/queryAnalysis.js';
import { retrievalNode } from './nodes/retrieval.js';
import { rerankingNode } from './nodes/reranking.js';
import { generationNode } from './nodes/generation.js';
import { citationVerificationNode } from './nodes/citationVerification.js';

// TypeScript Concept: LangGraph Annotation Definition
// Defines state channels, reducers, and default value factories for the agent workflow
export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  query: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  tenantId: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  userId: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  roleIds: Annotation<string[] | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  documentId: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  isSuperAdmin: Annotation<boolean | undefined>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  isConversationalOnly: Annotation<boolean | undefined>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  isSecurityFlagged: Annotation<boolean | undefined>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  securityViolationReason: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  piiEntitiesDetected: Annotation<any[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  retrievedCandidates: Annotation<HybridSearchResult[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  rerankedEvidence: Annotation<RerankedCandidate[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  assembledContext: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  generatedAnswer: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
  citations: Annotation<CitationItem[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  groundingScore: Annotation<number | undefined>({
    reducer: (_, update) => update,
    default: () => 1.0,
  }),
  abstentionFlag: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  abstentionReason: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  streamTokenCallback: Annotation<((token: string) => void) | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
  executionMetrics: Annotation<Record<string, number | undefined>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
});

// Conditional routing helper to skip retrieval for pure conversational queries or halt on security alerts
// returns: string
function routeAfterQueryAnalysis(state: typeof AgentStateAnnotation.State): string {
  if (state.isSecurityFlagged) {
    return 'securityHalt';
  }
  if (state.isConversationalOnly) {
    return 'generationNode';
  }
  return 'retrievalNode';
}

// Builds and compiles the stateful LangGraph orchestrator
// returns: Compiled StateGraph
export function buildKnowraAgent() {
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('queryAnalysisNode', queryAnalysisNode)
    .addNode('retrievalNode', retrievalNode)
    .addNode('rerankingNode', rerankingNode)
    .addNode('generationNode', generationNode)
    .addNode('citationVerificationNode', citationVerificationNode)
    .addEdge(START, 'queryAnalysisNode')
    .addConditionalEdges('queryAnalysisNode', routeAfterQueryAnalysis, {
      securityHalt: END,
      generationNode: 'generationNode',
      retrievalNode: 'retrievalNode',
    })
    .addEdge('retrievalNode', 'rerankingNode')
    .addEdge('rerankingNode', 'generationNode')
    .addEdge('generationNode', 'citationVerificationNode')
    .addEdge('citationVerificationNode', END);

  return workflow.compile();
}

// Pre-compiled singleton instance of the Knowra Agent
export const knowraAgent = buildKnowraAgent();

// Primary entry point for invoking the Knowra agent
// returns: Promise<KnowraAgentState>
export async function executeKnowraQuery(
  query: string,
  tenantId: string,
  options: {
    userId?: string;
    roleIds?: string[];
    isSuperAdmin?: boolean;
    documentId?: string;
    messages?: BaseMessage[];
    streamTokenCallback?: (token: string) => void;
  } = {}
): Promise<KnowraAgentState> {
  const totalStartTime = Date.now();

  const initialState = {
    messages: options.messages || [],
    query,
    tenantId,
    userId: options.userId,
    roleIds: options.roleIds,
    isSuperAdmin: options.isSuperAdmin || false,
    documentId: options.documentId,
    isConversationalOnly: false,
    isSecurityFlagged: false,
    securityViolationReason: undefined,
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

  // finalState is the accumulated KnowraAgentState after graph traversal
  const finalState = (await knowraAgent.invoke(initialState)) as KnowraAgentState;

  finalState.executionMetrics.totalDurationMs = Date.now() - totalStartTime;

  // returns: Promise<KnowraAgentState>
  return finalState;
}
