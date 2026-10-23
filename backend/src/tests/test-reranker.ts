// Integration test script for Cross-Encoder Reranker and Context Compression
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tenants, users } from '../db/schema/index.js';
import { hybridSearch } from '../services/retrieval/hybridSearch.js';
import { rerankCandidates, compressAndAssembleContext } from '../services/retrieval/reranker.js';

// Executes end-to-end test of candidate reranking and context compression
// returns: Promise<void>
async function runRerankerVerification(): Promise<void> {
  console.log('=====================================================');
  console.log('KNOWRA STEP 13: CROSS-ENCODER RERANKER & COMPRESSION TEST');
  console.log('=====================================================\n');

  // 1. Fetch active tenant and user from database
  console.log('[1/4] Loading tenant from database...');
  const tenant = await db.query.tenants.findFirst();

  if (!tenant) {
    throw new Error('Tenant record not found in database.');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.tenantId, tenant.id),
  });

  if (!user) {
    throw new Error('User record not found in database.');
  }

  console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);

  // 2. Fetch candidates via Step 12 Hybrid Search
  console.log('[2/4] Executing hybrid retrieval to generate candidate pool...');
  const testQuery = 'Explain multi-tenant isolation and role-based access control in Knowra';
  console.log(`Query: "${testQuery}"\n`);

  // candidates is an Array of HybridSearchResult objects
  const candidates = await hybridSearch({
    query: testQuery,
    tenantId: tenant.id,
    userId: user.id,
    isSuperAdmin: true,
    limit: 10,
  });

  console.log(`Retrieved ${candidates.length} hybrid search candidates.\n`);

  // 3. Rerank candidates using cross-encoder
  console.log('[3/4] Running Cross-Encoder Reranking...');
  // reranked is an Array of RerankedCandidate objects
  const reranked = await rerankCandidates(testQuery, candidates, 3);

  console.log(`Top ${reranked.length} reranked candidates:`);
  for (let i = 0; i < reranked.length; i++) {
    const item = reranked[i];
    console.log(`  [Rank ${i + 1}] ID: ${item.id}`);
    console.log(`    Rerank Score:   ${item.rerankScore.toFixed(4)}`);
    console.log(`    RRF Raw Score:  ${item.rrfScore.toFixed(6)}`);
    console.log(`    Citation Tag:   ${item.citationTag}`);
    console.log(`    Effective Tokens: ${item.tokenCount}`);
    console.log(`    Content Snippet: ${item.content.slice(0, 100).replace(/\n/g, ' ')}...\n`);
  }

  // 4. Test Context Compression and Parent Deduplication
  console.log('[4/4] Testing Context Compression and Parent Deduplication...');
  const compressed = compressAndAssembleContext(reranked, 4000);

  console.log(`Total Evidence Chunks:     ${compressed.evidenceChunks.length}`);
  console.log(`Total Accumulated Tokens:  ${compressed.totalTokens}`);
  console.log(`Deduplicated Parent Count: ${compressed.deduplicatedParentCount}`);
  console.log('\n--- Assembled LLM Context Preview ---');
  console.log(compressed.formattedContext.slice(0, 300));
  console.log('...\n--- End of Preview ---\n');

  if (compressed.totalTokens <= 4000 && compressed.evidenceChunks.length > 0) {
    console.log('SUCCESS: Token budget strictly respected and context formatted.');
  } else {
    throw new Error('FAILED: Context compression exceeded token budget or returned empty evidence.');
  }

  console.log('=====================================================');
  console.log('STEP 13 RERANKER & COMPRESSION COMPLETED SUCCESSFULLY!');
  console.log('=====================================================');
}

runRerankerVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Reranker verification failed:', err);
    process.exit(1);
  });
