// Vitest test runner imports
import { describe, expect, it } from 'vitest';
// Citation verification graph node
import { citationVerificationNode } from '../graph/nodes/citationVerification.js';
// State creator helper
import { createInitialState } from '../graph/state.js';
// RerankedCandidate type
import { RerankedCandidate } from '../services/retrieval/reranker.js';

describe('RAG Evaluation Harness & Triad Metrics Suite', () => {
  // Ground truth evaluation corpus for deterministic benchmarking
  const goldenCorpus: RerankedCandidate[] = [
    {
      id: 'golden-chunk-01',
      tenantId: 'tenant-eval',
      documentId: 'doc-security-policy',
      versionId: 'ver-1',
      parentChunkId: null,
      chunkIndex: 0,
      content: 'All production database access requires MFA and connection through the corporate WireGuard VPN tunnel.',
      microContent: 'Database access requires MFA and WireGuard VPN.',
      tokenCount: 22,
      pageNumber: 3,
      sectionHeading: 'Production Access Protocols',
      headingPath: 'Security Manual > Infrastructure > Production',
      chunkStrategy: 'semantic',
      rrfScore: 0.98,
      rerankScore: 0.96,
      citationTag: '[Evidence 1]',
    },
    {
      id: 'golden-chunk-02',
      tenantId: 'tenant-eval',
      documentId: 'doc-onboarding-faq',
      versionId: 'ver-1',
      parentChunkId: null,
      chunkIndex: 1,
      content: 'Hardware stipends of $1,500 are distributed via payroll in the first month of employment for home office equipment.',
      microContent: 'Hardware stipends of $1,500 are distributed in month 1.',
      tokenCount: 24,
      pageNumber: 1,
      sectionHeading: 'Home Office Equipment',
      headingPath: 'Employee Onboarding > Benefits > Equipment Stipend',
      chunkStrategy: 'semantic',
      rrfScore: 0.91,
      rerankScore: 0.89,
      citationTag: '[Evidence 2]',
    },
  ];

  describe('Metric 1: Groundedness & Faithfulness (Entailment Ratio)', () => {
    it('should compute 100% faithfulness for fully entailed factual answers', async () => {
      const state = createInitialState('What are the requirements for production database access?', 'tenant-eval');
      state.rerankedEvidence = goldenCorpus;
      state.generatedAnswer =
        'Production database access strictly requires MFA and connection through the corporate WireGuard VPN tunnel [Evidence 1].';

      const result = await citationVerificationNode(state);

      expect(result.groundingScore).toBe(1.0);
      expect(result.citations!.length).toBe(1);
      expect(result.citations![0].isEntailed).toBe(true);
    });

    it('should penalize hallucinated numbers with reduced faithfulness score', async () => {
      const state = createInitialState('How much is the home office hardware stipend?', 'tenant-eval');
      state.rerankedEvidence = goldenCorpus;
      // Hallucinated stipend amount ($3,500 instead of real $1,500 in Evidence 2)
      state.generatedAnswer =
        'The home office equipment stipend is $3,500 disbursed in the first month [Evidence 2].';

      const result = await citationVerificationNode(state);

      expect(result.groundingScore).toBe(0.0);
      expect(result.citations!.length).toBe(0);
    });
  });

  describe('Metric 2: Citation Precision', () => {
    it('should calculate 100% citation precision when all cited tags map to valid evidence', async () => {
      const state = createInitialState('Summarize database access and home office stipend.', 'tenant-eval');
      state.rerankedEvidence = goldenCorpus;
      state.generatedAnswer =
        'Database access requires WireGuard VPN and MFA [Evidence 1]. The hardware stipend is $1,500 [Evidence 2].';

      const result = await citationVerificationNode(state);

      expect(result.citations!.length).toBe(2);
      expect(result.groundingScore).toBe(1.0);
    });

    it('should reject nonexistent evidence indices like [Evidence 99]', async () => {
      const state = createInitialState('What is the travel policy?', 'tenant-eval');
      state.rerankedEvidence = goldenCorpus;
      state.generatedAnswer =
        'Travel meals are reimbursed up to $75 per diem [Evidence 99].';

      const result = await citationVerificationNode(state);

      // Evidence 99 does not exist in the 2-chunk corpus
      expect(result.citations!.length).toBe(0);
      expect(result.groundingScore).toBe(0.0);
    });
  });

  describe('Metric 3: Safe Abstention on Unanswerable Queries', () => {
    it('should achieve 100% abstention precision when zero candidate evidence exists', async () => {
      const state = createInitialState('What is the secret corporate merger date?', 'tenant-eval');
      state.rerankedEvidence = [];
      state.generatedAnswer =
        'I cannot find sufficient evidence in the enterprise documents to answer this question accurately.';

      const result = await citationVerificationNode(state);

      expect(result.abstentionFlag).toBe(true);
      expect(result.citations!.length).toBe(0);
      expect(result.groundingScore).toBe(0.0);
    });
  });

  describe('Metric 4: Context Relevance & Token Efficiency', () => {
    it('should verify evidence contains non-zero token count and required section metadata', () => {
      for (const evidence of goldenCorpus) {
        expect(evidence.tokenCount).toBeGreaterThan(0);
        expect(evidence.headingPath).not.toBeNull();
        expect(evidence.content.length).toBeGreaterThan(20);
      }
    });
  });
});
