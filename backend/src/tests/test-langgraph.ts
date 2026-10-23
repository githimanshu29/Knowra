// Integration test script for LangGraph Stateful Agentic Orchestration
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tenants, users } from '../db/schema/index.js';
import { executeKnowraQuery } from '../graph/index.js';

// Executes end-to-end verification of LangGraph agentic workflow
// returns: Promise<void>
async function runLangGraphVerification(): Promise<void> {
  console.log('=====================================================');
  console.log('KNOWRA STEP 14: LANGGRAPH AGENTIC WORKFLOW TEST');
  console.log('=====================================================\n');

  // 1. Fetch active tenant and user from database
  console.log('[1/4] Loading active tenant from database...');
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

  // 2. Test 1: Conversational Greeting (Conditional Skip Routing)
  console.log('[2/4] Testing Conversational Query (Skip Retrieval Routing)...');
  const greetingQuery = 'Hello! Who are you and how can you help me?';
  console.log(`User Input: "${greetingQuery}"`);

  // greetingResult is a KnowraAgentState object
  const greetingResult = await executeKnowraQuery(greetingQuery, tenant.id, {
    userId: user.id,
  });

  console.log(`- Is Conversational?:   ${greetingResult.isConversationalOnly}`);
  console.log(`- Retrieved Chunks:     ${greetingResult.retrievedCandidates.length} (Should be 0 - Retrieval Skipped!)`);
  console.log(`- Generated Answer:\n  ${greetingResult.generatedAnswer}\n`);

  if (!greetingResult.isConversationalOnly || greetingResult.retrievedCandidates.length !== 0) {
    throw new Error('FAILED: Conversational routing failed to bypass retrieval.');
  }

  // 3. Test 2: Enterprise Knowledge Query (Full Pipeline Traversal)
  console.log('[3/4] Testing Enterprise Knowledge Query (Full Retrieval & Citation)...');
  const knowledgeQuery = 'How does Knowra segregate data between companies and enforce security?';
  console.log(`User Input: "${knowledgeQuery}"`);

  // knowledgeResult is a KnowraAgentState object
  const knowledgeResult = await executeKnowraQuery(knowledgeQuery, tenant.id, {
    userId: user.id,
    isSuperAdmin: true,
  });

  console.log(`- Is Conversational?:   ${knowledgeResult.isConversationalOnly}`);
  console.log(`- Retrieved Chunks:     ${knowledgeResult.retrievedCandidates.length}`);
  console.log(`- Reranked Evidence:    ${knowledgeResult.rerankedEvidence.length}`);
  console.log(`- Abstention Flag:      ${knowledgeResult.abstentionFlag}`);
  console.log(`- Citations Count:      ${knowledgeResult.citations.length}`);
  console.log(`- Total Duration:       ${knowledgeResult.executionMetrics.totalDurationMs} ms`);
  console.log(`\nGenerated Response:\n${knowledgeResult.generatedAnswer}\n`);

  console.log('Structured Citations Attached:');
  for (const c of knowledgeResult.citations) {
    console.log(`  - ${c.citationTag} [Doc: ${c.documentId}] (Section: ${c.headingPath ?? 'General'})`);
    console.log(`    Snippet: ${c.snippet.slice(0, 100)}...`);
  }

  if (knowledgeResult.rerankedEvidence.length === 0 || knowledgeResult.citations.length === 0) {
    throw new Error('FAILED: Enterprise knowledge query did not produce evidence or citations.');
  }

  // 4. Test 3: Safe Abstention on Foreign / Unrelated Query
  console.log('\n[4/4] Testing Safe Abstention on Foreign Tenant...');
  const fakeTenantId = '00000000-0000-0000-0000-000000000000';
  const abstentionResult = await executeKnowraQuery('Explain quarterly balance sheet', fakeTenantId);

  console.log(`- Querying Foreign Tenant: ${fakeTenantId}`);
  console.log(`- Abstention Flag:         ${abstentionResult.abstentionFlag}`);
  console.log(`- Generated Answer:\n  ${abstentionResult.generatedAnswer}\n`);

  if (!abstentionResult.abstentionFlag) {
    throw new Error('FAILED: Agent did not abstain when no enterprise evidence was found.');
  }

  console.log('=====================================================');
  console.log('STEP 14 LANGGRAPH ORCHESTRATION COMPLETED SUCCESSFULLY!');
  console.log('=====================================================');
}

runLangGraphVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('LangGraph verification failed:', err);
    process.exit(1);
  });
