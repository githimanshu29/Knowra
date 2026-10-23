// Integration test script for Hybrid Retrieval Engine and Reciprocal Rank Fusion
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tenants, users } from '../db/schema/index.js';
import { hybridSearch, HybridSearchResult } from '../services/retrieval/hybridSearch.js';

// Executes end-to-end test of hybrid vector and lexical retrieval with RRF
// returns: Promise<void>
async function runHybridSearchVerification(): Promise<void> {
  console.log('=====================================================');
  console.log('KNOWRA STEP 12: HYBRID RETRIEVAL & RRF TEST');
  console.log('=====================================================\n');

  // 1. Locate active tenant and user from previous ingestion runs
  console.log('[1/4] Fetching active tenant and user from database...');
  // tenant is a single object or undefined
  const tenant = await db.query.tenants.findFirst();

  if (!tenant) {
    throw new Error('No tenant found in database. Please run test-ingestion-worker.ts first.');
  }

  // user is a single object or undefined
  const user = await db.query.users.findFirst({
    where: eq(users.tenantId, tenant.id),
  });

  if (!user) {
    throw new Error('No user found for tenant. Please run test-ingestion-worker.ts first.');
  }

  console.log(`Active Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Active User:   ${user.fullName} (${user.id})\n`);

  // 2. Test semantic query: Vector branch dominant
  console.log('[2/4] Executing Semantic Query (Vector Dominant)...');
  const semanticQuery = 'How does Knowra segregate data between companies?';
  console.log(`Query: "${semanticQuery}"`);

  // semanticResults is an Array of HybridSearchResult objects
  const semanticResults: HybridSearchResult[] = await hybridSearch({
    query: semanticQuery,
    tenantId: tenant.id,
    userId: user.id,
    isSuperAdmin: true,
    limit: 3,
  });

  console.log(`Found ${semanticResults.length} fused results:`);
  for (let i = 0; i < semanticResults.length; i++) {
    const r = semanticResults[i];
    console.log(`  [Rank ${i + 1}] ID: ${r.id}`);
    console.log(`    Strategy:     ${r.chunkStrategy}`);
    console.log(`    RRF Score:    ${r.rrfScore.toFixed(6)}`);
    console.log(`    Vector Rank:  ${r.vectorRank ?? 'N/A'} (Score: ${r.vectorScore ? r.vectorScore.toFixed(4) : 'N/A'})`);
    console.log(`    Lexical Rank: ${r.lexicalRank ?? 'N/A'} (Score: ${r.lexicalScore ? r.lexicalScore.toFixed(4) : 'N/A'})`);
    console.log(`    Heading Path: ${r.headingPath ?? 'N/A'}`);
    console.log(`    Has Parent?:  ${r.parentChunk ? 'YES (Parent ID: ' + r.parentChunk.id + ')' : 'NO'}`);
    if (r.parentChunk) {
      console.log(`    Parent Macro Content Preview:`);
      console.log(`      ${r.parentChunk.content.slice(0, 140).replace(/\n/g, ' ')}...`);
    }
    console.log(`    Micro Chunk Content:`);
    console.log(`      ${r.content.slice(0, 120).replace(/\n/g, ' ')}...\n`);
  }

  // 3. Test exact keyword query: Lexical branch dominant
  console.log('[3/4] Executing Keyword Query (Lexical tsvector Dominant)...');
  const keywordQuery = 'Reciprocal Rank Fusion tsvector GIN';
  console.log(`Query: "${keywordQuery}"`);

  // keywordResults is an Array of HybridSearchResult objects
  const keywordResults: HybridSearchResult[] = await hybridSearch({
    query: keywordQuery,
    tenantId: tenant.id,
    userId: user.id,
    isSuperAdmin: false,
    limit: 3,
  });

  console.log(`Found ${keywordResults.length} fused results:`);
  for (let i = 0; i < keywordResults.length; i++) {
    const r = keywordResults[i];
    console.log(`  [Rank ${i + 1}] ID: ${r.id}`);
    console.log(`    RRF Score:    ${r.rrfScore.toFixed(6)}`);
    console.log(`    Vector Rank:  ${r.vectorRank ?? 'N/A'}`);
    console.log(`    Lexical Rank: ${r.lexicalRank ?? 'N/A'} (Score: ${r.lexicalScore ? r.lexicalScore.toFixed(4) : 'N/A'})`);
    console.log(`    Heading Path: ${r.headingPath ?? 'N/A'}`);
    console.log(`    Micro Content: ${r.content.slice(0, 100).replace(/\n/g, ' ')}...\n`);
  }

  // 4. Test multi-tenant isolation guard: Querying with a non-existent tenant ID
  console.log('[4/4] Testing Multi-Tenant Data Isolation Guard...');
  const fakeTenantId = '00000000-0000-0000-0000-000000000000';
  const unauthorizedResults = await hybridSearch({
    query: 'Knowra Enterprise Knowledge Assistant',
    tenantId: fakeTenantId,
    isSuperAdmin: true,
    limit: 5,
  });

  console.log(`Querying foreign tenant ID: ${fakeTenantId}`);
  console.log(`Results returned across tenant boundary: ${unauthorizedResults.length}`);

  if (unauthorizedResults.length === 0) {
    console.log('SUCCESS: Tenant isolation barrier strictly verified (0 leaked chunks).');
  } else {
    throw new Error('SECURITY VIOLATION: Chunks leaked across tenant boundaries!');
  }

  console.log('\n=====================================================');
  console.log('STEP 12 HYBRID SEARCH VERIFICATION COMPLETED SUCCESSFULLY!');
  console.log('=====================================================');
}

runHybridSearchVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Hybrid search verification failed:', err);
    process.exit(1);
  });
