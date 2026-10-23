// Knowra agent state type
import { KnowraAgentState } from '../state.js';

// Common conversational phrases that do not require enterprise document retrieval
const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy)\b/i,
  /^who\s+are\s+you/i,
  /^what\s+can\s+you\s+do/i,
  /^(thanks|thank\s+you|cheers|bye|goodbye)\b/i,
];

// Node 1: Analyzes user intent to determine whether retrieval is needed
// returns: Promise<Partial<KnowraAgentState>>
export async function queryAnalysisNode(state: KnowraAgentState): Promise<Partial<KnowraAgentState>> {
  const trimmed = state.query.trim();

  // Check if query is conversational greeting
  let isConversational = false;
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      isConversational = true;
      break;
    }
  }

  // returns: Partial<KnowraAgentState>
  return {
    isConversationalOnly: isConversational,
  };
}
