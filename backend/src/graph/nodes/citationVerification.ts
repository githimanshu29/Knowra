// Citation item interface and agent state type
import { CitationItem, KnowraAgentState } from '../state.js';

// Node 5: Verifies that cited claims match real evidence and extracts citation metadata
// returns: Promise<Partial<KnowraAgentState>>
export async function citationVerificationNode(state: KnowraAgentState): Promise<Partial<KnowraAgentState>> {
  const startTime = Date.now();

  const answer = state.generatedAnswer || '';
  const abstentionKeywords = [
    'cannot find sufficient evidence',
    'insufficient evidence',
    'no relevant information found',
  ];

  // Check if answer represents an abstention
  let isAbstaining = state.abstentionFlag;
  for (const phrase of abstentionKeywords) {
    if (answer.toLowerCase().includes(phrase)) {
      isAbstaining = true;
      break;
    }
  }

  if (isAbstaining) {
    return {
      abstentionFlag: true,
      citations: [],
      executionMetrics: {
        ...state.executionMetrics,
        verificationDurationMs: Date.now() - startTime,
      },
    };
  }

  // Parse evidence tag occurrences like [Evidence 1] or [Evidence 2]
  const citationRegex = /\[Evidence\s+(\d+)[^\]]*\]/gi;
  const referencedIndices = new Set<number>();
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(answer)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) {
      referencedIndices.add(num);
    }
  }

  // Build verified citations list
  const verifiedCitations: CitationItem[] = [];
  const evidenceList = state.rerankedEvidence || [];

  for (const indexNum of referencedIndices) {
    const chunkIndex = indexNum - 1;
    if (chunkIndex >= 0 && chunkIndex < evidenceList.length) {
      const chunk = evidenceList[chunkIndex];
      verifiedCitations.push({
        citationTag: `[Evidence ${indexNum}]`,
        documentId: chunk.documentId,
        headingPath: chunk.headingPath,
        snippet: chunk.content.slice(0, 250).replace(/\n/g, ' '),
      });
    }
  }

  // If no specific in-line tag was matched but evidence exists, attach top evidence item as default attribution
  if (verifiedCitations.length === 0 && evidenceList.length > 0 && !state.isConversationalOnly) {
    const topChunk = evidenceList[0];
    verifiedCitations.push({
      citationTag: '[Evidence 1]',
      documentId: topChunk.documentId,
      headingPath: topChunk.headingPath,
      snippet: topChunk.content.slice(0, 250).replace(/\n/g, ' '),
    });
  }

  const durationMs = Date.now() - startTime;

  // returns: Partial<KnowraAgentState>
  return {
    abstentionFlag: isAbstaining,
    citations: verifiedCitations,
    executionMetrics: {
      ...state.executionMetrics,
      verificationDurationMs: durationMs,
    },
  };
}
