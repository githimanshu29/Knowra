// Citation item interface and agent state type
import { CitationItem, KnowraAgentState } from '../state.js';

// Verifies whether numbers and key terms in a claim statement exist in the candidate chunk
// returns: boolean
function verifyClaimEntailment(claim: string, chunkContent: string): boolean {
  const cleanChunk = chunkContent.toLowerCase();
  const cleanClaim = claim.toLowerCase();

  // 1. Numerical Entailment: Every number mentioned in the claim must exist in the chunk
  // Strip [evidence N] citation tags first so citation indices are not treated as factual claims
  const claimTextWithoutTags = cleanClaim.replace(/\[evidence\s+\d+[^\]]*\]/gi, '');
  const numberRegex = /\b\d+(?:[.,]\d+)?%?\b/g;
  const claimNumbers = claimTextWithoutTags.match(numberRegex) || [];

  for (const num of claimNumbers) {
    if (!cleanChunk.includes(num)) {
      // Numerical hallucination detected
      return false;
    }
  }

  // 2. Lexical Entailment: Key content words in the claim must have significant presence in the chunk
  const claimWords = cleanClaim
    .replace(/\[evidence\s+\d+[^\]]*\]/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  if (claimWords.length === 0) {
    return true;
  }

  let matchingWordsCount = 0;
  for (const word of claimWords) {
    if (cleanChunk.includes(word)) {
      matchingWordsCount++;
    }
  }

  const lexicalOverlapRatio = matchingWordsCount / claimWords.length;
  // Entailed if at least 35 percent of significant content words are attested in source chunk
  return lexicalOverlapRatio >= 0.35;
}

// Node 5: Verifies claim entailment against evidence chunks and computes grounding score
// returns: Promise<Partial<KnowraAgentState>>
export async function citationVerificationNode(state: KnowraAgentState): Promise<Partial<KnowraAgentState>> {
  const startTime = Date.now();

  const answer = state.generatedAnswer || '';
  const abstentionKeywords = [
    'cannot find sufficient evidence',
    'insufficient evidence',
    'no relevant information found',
    'does not contain sufficient information',
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
      groundingScore: 0.0,
      executionMetrics: {
        ...state.executionMetrics,
        verificationDurationMs: Date.now() - startTime,
      },
    };
  }

  // Split response into individual sentences to evaluate claims
  const sentences = answer
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const evidenceList = state.rerankedEvidence || [];
  const verifiedCitations: CitationItem[] = [];
  let totalCitedClaims = 0;
  let entailedClaimsCount = 0;

  for (const sentence of sentences) {
    const citationRegex = /\[Evidence\s+(\d+)[^\]]*\]/gi;
    let match: RegExpExecArray | null;
    const referencedIndices = new Set<number>();

    while ((match = citationRegex.exec(sentence)) !== null) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        referencedIndices.add(num);
      }
    }

    if (referencedIndices.size > 0) {
      totalCitedClaims += referencedIndices.size;

      for (const indexNum of referencedIndices) {
        const chunkIndex = indexNum - 1;

        if (chunkIndex >= 0 && chunkIndex < evidenceList.length) {
          const chunk = evidenceList[chunkIndex];
          const isEntailed = verifyClaimEntailment(sentence, chunk.content);

          if (isEntailed) {
            entailedClaimsCount++;
            // Deduplicate citations by documentId and citationTag
            const alreadyExists = verifiedCitations.some(
              (c) => c.citationTag === `[Evidence ${indexNum}]` && c.documentId === chunk.documentId
            );

            if (!alreadyExists) {
              verifiedCitations.push({
                citationTag: `[Evidence ${indexNum}]`,
                documentId: chunk.documentId,
                headingPath: chunk.headingPath,
                snippet: chunk.content.slice(0, 250).replace(/\n/g, ' '),
                claim: sentence,
                isEntailed: true,
              });
            }
          }
        }
      }
    }
  }

  // Calculate grounding score: ratio of entailed claims to total cited claims
  let groundingScore = 1.0;
  if (totalCitedClaims > 0) {
    groundingScore = Number((entailedClaimsCount / totalCitedClaims).toFixed(2));
  } else if (!state.isConversationalOnly && evidenceList.length > 0) {
    // Model answered without providing any in-line citations despite evidence presence
    groundingScore = 0.5;
  }

  const durationMs = Date.now() - startTime;

  // returns: Partial<KnowraAgentState>
  return {
    abstentionFlag: isAbstaining,
    citations: verifiedCitations,
    groundingScore,
    executionMetrics: {
      ...state.executionMetrics,
      verificationDurationMs: durationMs,
    },
  };
}
