// Knowra agent state type
import { KnowraAgentState } from '../state.js';
// Security guardrails service for prompt injection scanning and PII redaction
import { evaluateInputGuardrails } from '../../services/security/guardrails.js';

// Common conversational phrases that do not require enterprise document retrieval
const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy)\b/i,
  /^who\s+are\s+you/i,
  /^what\s+can\s+you\s+do/i,
  /^(thanks|thank\s+you|cheers|bye|goodbye)\b/i,
];

// Node 1: Executes input security guardrails, PII redaction, and intent routing
// returns: Promise<Partial<KnowraAgentState>>
export async function queryAnalysisNode(state: KnowraAgentState): Promise<Partial<KnowraAgentState>> {
  // 1. Execute enterprise input guardrail scanner
  const guardrailResult = evaluateInputGuardrails(state.query);

  // If prompt injection or jailbreak payload detected, halt execution immediately
  if (!guardrailResult.allowed) {
    const violationReason = guardrailResult.injectionCheck.reason || 'Prompt injection attack detected';
    return {
      isSecurityFlagged: true,
      securityViolationReason: violationReason,
      abstentionFlag: true,
      generatedAnswer: `Security Alert: Your query has been flagged by enterprise input guardrails (${violationReason}). Request blocked.`,
      citations: [],
    };
  }

  // 2. Use sanitized query with sensitive PII masked
  const sanitizedQuery = guardrailResult.sanitizedQuery;
  const trimmed = sanitizedQuery.trim();

  // 3. Check if query is conversational greeting
  let isConversational = false;
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      isConversational = true;
      break;
    }
  }

  // returns: Partial<KnowraAgentState>
  return {
    query: sanitizedQuery,
    isSecurityFlagged: false,
    isConversationalOnly: isConversational,
    piiEntitiesDetected: guardrailResult.piiCheck.entities,
  };
}
