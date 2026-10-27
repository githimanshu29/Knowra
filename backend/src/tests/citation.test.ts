// Vitest test runner imports
import { describe, expect, it } from 'vitest';
// Citation verification graph node
import { citationVerificationNode } from '../graph/nodes/citationVerification.js';
// State creator helper
import { createInitialState } from '../graph/state.js';
// RerankedCandidate type
import { RerankedCandidate } from '../services/retrieval/reranker.js';

describe('Citation Entailment & Grounding Verification Suite', () => {
  const mockEvidence: RerankedCandidate[] = [
    {
      id: 'chunk-1',
      tenantId: 'tenant-1',
      documentId: 'doc-1',
      versionId: 'ver-1',
      parentChunkId: null,
      chunkIndex: 0,
      content: 'Employees receive 20 days of paid annual vacation leave each calendar year upon completing probation.',
      microContent: 'Employees receive 20 days of paid annual vacation leave.',
      tokenCount: 25,
      pageNumber: 1,
      sectionHeading: 'Vacation Policy',
      headingPath: 'Employee Handbook > Leave > Vacation',
      chunkStrategy: 'semantic',
      rrfScore: 0.95,
      rerankScore: 0.92,
      citationTag: '[Evidence 1]',
    },
    {
      id: 'chunk-2',
      tenantId: 'tenant-1',
      documentId: 'doc-2',
      versionId: 'ver-1',
      parentChunkId: null,
      chunkIndex: 1,
      content: 'The 401k corporate retirement plan offers a 5% matching contribution on employee salary deferrals.',
      microContent: 'The 401k retirement plan offers a 5% matching contribution.',
      tokenCount: 22,
      pageNumber: 2,
      sectionHeading: 'Retirement Benefits',
      headingPath: 'Benefits > Retirement > 401k',
      chunkStrategy: 'semantic',
      rrfScore: 0.88,
      rerankScore: 0.85,
      citationTag: '[Evidence 2]',
    },
  ];

  it('should verify genuine grounded factual claims and matching numbers', async () => {
    const state = createInitialState('How many days of vacation do employees get?', 'tenant-1');
    state.rerankedEvidence = mockEvidence;
    state.generatedAnswer = 'Employees are entitled to 20 days of paid vacation per year [Evidence 1].';

    const result = await citationVerificationNode(state);

    expect(result.abstentionFlag).toBe(false);
    expect(result.citations).toBeDefined();
    expect(result.citations!.length).toBe(1);
    expect(result.citations![0].isEntailed).toBe(true);
    expect(result.citations![0].citationTag).toBe('[Evidence 1]');
    expect(result.groundingScore).toBe(1.0);
  });

  it('should reject citations where the model hallucinated numbers not present in the chunk', async () => {
    const state = createInitialState('What is the vacation policy?', 'tenant-1');
    state.rerankedEvidence = mockEvidence;
    // Model hallucinates 45 days instead of the real 20 days in chunk 1
    state.generatedAnswer = 'Employees are entitled to 45 days of paid vacation per year [Evidence 1].';

    const result = await citationVerificationNode(state);

    // Entailment check must catch numerical mismatch and reject false citation
    expect(result.citations!.length).toBe(0);
    expect(result.groundingScore).toBe(0.0);
  });

  it('should NEVER attach a default citation when the model cites nothing', async () => {
    const state = createInitialState('Tell me about the policies', 'tenant-1');
    state.rerankedEvidence = mockEvidence;
    // Model produced an ungrounded answer without any [Evidence N] tags
    state.generatedAnswer = 'Our company offers modern workplace benefits and compensation programs.';

    const result = await citationVerificationNode(state);

    // Critical assertion: Must NOT fabricate or attach [Evidence 1] by default
    expect(result.citations!.length).toBe(0);
  });

  it('should recognize explicit abstention phrases correctly', async () => {
    const state = createInitialState('What is the pet policy in the office?', 'tenant-1');
    state.rerankedEvidence = mockEvidence;
    state.generatedAnswer =
      'I cannot find sufficient evidence in the enterprise documents to answer this question accurately.';

    const result = await citationVerificationNode(state);

    expect(result.abstentionFlag).toBe(true);
    expect(result.citations!.length).toBe(0);
    expect(result.groundingScore).toBe(0.0);
  });
});
