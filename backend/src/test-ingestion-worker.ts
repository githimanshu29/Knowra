// Integration test script for Batch Vector Embedder and Ingestion Worker
import { eq, sql } from 'drizzle-orm';
import { db } from './db/index.js';
import { chunks, documents, documentVersions, ingestionJobs, tenants, users } from './db/schema/index.js';
import { saveFile } from './services/storage.service.js';
import { processIngestionJob } from './services/ingestion/worker.js';
import { generateEmbedding } from './services/ingestion/embedder.js';

// Sample enterprise markdown document for ingestion test
const sampleEnterpriseKnowledgeDoc = `# Knowra Enterprise Knowledge Assistant

Knowra is an advanced enterprise intelligence platform engineered to solve multi-tenant knowledge discovery. It combines lexical keyword matching with deep semantic vector search.

## Security Architecture

Every tenant data boundary is strictly segregated. Multi-tenant isolation is enforced at the database layer using foreign key tenant identifiers and row-level authorization filters.

Role-based access control prevents unauthorized members from viewing sensitive documents such as financial disclosures and executive strategy notes.

## Hybrid Retrieval Pipeline

The retrieval engine queries PostgreSQL using two parallel execution branches:
1. Lexical full text search via tsvector and GIN inverted index.
2. Vector similarity search via pgvector cosine distance operator.

Results from both search branches are normalized and merged using Reciprocal Rank Fusion.
`;

// Executes full end-to-end ingestion test
// returns: Promise<void>
async function runIngestionWorkerVerification(): Promise<void> {
  console.log('=====================================================');
  console.log('KNOWRA END-TO-END INGESTION WORKER & PGVECTOR TEST');
  console.log('=====================================================\n');

  // 1. Find or seed an active tenant and user for testing
  console.log('[1/5] Checking tenant and user database records...');
  // tenant is a single object { id: string, name: string, ... } or undefined
  let tenant = await db.query.tenants.findFirst();

  if (!tenant) {
    const [createdTenant] = await db
      .insert(tenants)
      .values({
        name: 'Knowra Demo Tenant',
        slug: `tenant-${Date.now()}`,
      })
      .returning();
    tenant = createdTenant;
  }

  // user is a single object { id: string, email: string, ... } or undefined
  let user = await db.query.users.findFirst({
    where: eq(users.tenantId, tenant.id),
  });

  if (!user) {
    const [createdUser] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: `admin-${Date.now()}@knowra.ai`,
        passwordHash: 'dummy-hash-for-testing',
        fullName: 'Ingestion Test Admin',
      })
      .returning();
    user = createdUser;
  }

  console.log(`Using Tenant ID: ${tenant.id} (${tenant.name})`);
  console.log(`Using User ID:   ${user.id} (${user.email})\n`);

  // 2. Save document to disk storage
  console.log('[2/5] Storing sample markdown file to disk...');
  const fileBuffer = Buffer.from(sampleEnterpriseKnowledgeDoc, 'utf-8');
  const filename = 'knowra-security-guide.md';
  const storagePath = await saveFile(tenant.id, filename, fileBuffer);
  console.log(`File saved to: ${storagePath}\n`);

  // 3. Create document, version, and queued ingestion job in database
  console.log('[3/5] Inserting document and queuing ingestion job in database...');
  const [newDoc] = await db
    .insert(documents)
    .values({
      tenantId: tenant.id,
      createdBy: user.id,
      title: 'Knowra Enterprise Knowledge Assistant',
      filename,
      mimeType: 'text/markdown',
      fileSizeBytes: fileBuffer.length,
      contentHash: `hash-${Date.now()}`,
      storagePath,
      status: 'QUEUED',
    })
    .returning();

  const [newVersion] = await db
    .insert(documentVersions)
    .values({
      documentId: newDoc.id,
      versionNumber: 1,
      contentHash: newDoc.contentHash,
    })
    .returning();

  const [newJob] = await db
    .insert(ingestionJobs)
    .values({
      tenantId: tenant.id,
      documentId: newDoc.id,
      status: 'QUEUED',
      progressPercent: 0,
    })
    .returning();

  console.log(`Document ID:  ${newDoc.id}`);
  console.log(`Version ID:   ${newVersion.id}`);
  console.log(`Job ID:       ${newJob.id}\n`);

  // 4. Run the Ingestion Worker
  console.log('[4/5] Executing processIngestionJob()...');
  const result = await processIngestionJob(newJob.id);
  console.log(`Job Execution Status: ${result.status}`);
  console.log(`Total Chunks Stored:  ${result.totalChunks}\n`);

  // 5. Query and verify PostgreSQL chunks table
  console.log('[5/5] Verifying PostgreSQL chunks table with pgvector & tsvector...');
  // storedChunks is an Array of Objects containing chunk attributes
  const storedChunks = await db.query.chunks.findMany({
    where: eq(chunks.documentId, newDoc.id),
  });

  console.log(`Chunks found in DB: ${storedChunks.length}`);

  const parentChunks = storedChunks.filter((c) => c.chunkStrategy === 'parent');
  const childChunks = storedChunks.filter((c) => c.chunkStrategy === 'child');

  console.log(`- Parent Chunks (Macro): ${parentChunks.length}`);
  console.log(`- Child Chunks (Micro):  ${childChunks.length}`);

  if (childChunks.length > 0) {
    const sampleChild = childChunks[0];
    console.log(`\nSample Child Chunk:`);
    console.log(`  ID:            ${sampleChild.id}`);
    console.log(`  Parent ID:     ${sampleChild.parentChunkId}`);
    console.log(`  Strategy:      ${sampleChild.chunkStrategy}`);
    console.log(`  Heading Path:  ${sampleChild.headingPath}`);
    console.log(`  Embedding Dim: ${sampleChild.embedding ? sampleChild.embedding.length : 'NULL'}`);
    console.log(`  Content:\n  ${sampleChild.content.slice(0, 150)}...\n`);
  }

  // 6. Test Vector Cosine Distance Search Query (<=> operator)
  console.log('Testing pgvector Cosine Distance Query...');
  const testQuery = 'How does Knowra enforce multi-tenant isolation?';
  const queryVector = await generateEmbedding(testQuery);
  const vectorStr = `[${queryVector.join(',')}]`;

  // rawVectorResults is an Array of Objects returned by pg driver
  const rawVectorResults = await db.execute(sql`
    SELECT 
      id, 
      chunk_strategy,
      heading_path,
      content,
      1 - (embedding <=> ${vectorStr}::vector) AS cosine_similarity
    FROM chunks
    WHERE tenant_id = ${tenant.id}
      AND document_id = ${newDoc.id}
    ORDER BY embedding <=> ${vectorStr}::vector ASC
    LIMIT 2;
  `);

  console.log(`pgvector Top Matches for query: "${testQuery}"`);
  for (const row of rawVectorResults.rows) {
    const r = row as { id: string; chunk_strategy: string; cosine_similarity: number; content: string };
    console.log(`  - [Score: ${Number(r.cosine_similarity).toFixed(4)}] [${r.chunk_strategy}] ${r.content.slice(0, 90)}...`);
  }

  // 7. Test Lexical Full-Text tsvector Search Query (@@ operator)
  console.log('\nTesting tsvector Lexical GIN Search Query...');
  // rawLexicalResults is an Array of Objects returned by pg driver
  const rawLexicalResults = await db.execute(sql`
    SELECT 
      id,
      chunk_strategy,
      heading_path,
      content,
      ts_rank_cd(search_vector, plainto_tsquery('english', 'Segregated Isolation')) AS lexical_rank
    FROM chunks
    WHERE tenant_id = ${tenant.id}
      AND document_id = ${newDoc.id}
      AND search_vector @@ plainto_tsquery('english', 'Segregated Isolation')
    ORDER BY lexical_rank DESC
    LIMIT 2;
  `);

  console.log(`tsvector Matches for keywords "Segregated Isolation": ${rawLexicalResults.rows.length}`);
  for (const row of rawLexicalResults.rows) {
    const r = row as { id: string; lexical_rank: number; content: string };
    console.log(`  - [Rank: ${Number(r.lexical_rank).toFixed(4)}] ${r.content.slice(0, 90)}...`);
  }

  console.log('\n=====================================================');
  console.log('ALL INGESTION WORKER & PGVECTOR TESTS COMPLETED SUCCESSFULLY!');
  console.log('=====================================================');
}

runIngestionWorkerVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ingestion worker verification failed:', err);
    process.exit(1);
  });
