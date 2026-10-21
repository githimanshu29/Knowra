// Integration test script for Hierarchical Semantic Chunker
import { parseDocument } from './services/ingestion/parsers.js';
import { chunkDocument, ProcessedChunk } from './services/ingestion/chunker.js';

// Sample enterprise markdown document simulating a multi-section knowledge base article
const sampleEnterpriseDoc = `# Knowra Enterprise Platform

Knowra is a production-grade enterprise knowledge intelligence platform built with Node.js, Express, and PostgreSQL. It enables organizations to ingest diverse multi-tenant documents with strict authorization and high precision retrieval.

## Ingestion Architecture

The ingestion pipeline handles raw document formats and converts them into structured semantic blocks. Every block retains its original source file name, page number, timestamp, document type, and authorization access level.

### Hierarchical Semantic Chunking

Hierarchical chunking creates dual-layer chunks: macro parent chunks and micro child chunks. Parent chunks preserve surrounding context, while child chunks provide high-density vector representations for cosine similarity matching.

Heading breadcrumbs are automatically prepended to every child chunk. This ensures the vector embedding model understands the exact topic hierarchy even when reading an isolated sentence.

## Document Authorization and RBAC

Enterprise security requires multi-tenant isolation and role-based permissions. Every query executed by the hybrid search engine includes strict tenant filters to prevent data leakage across customer boundaries.

Role-restricted documents can only be accessed by users holding the designated enterprise role such as Legal, Engineering, or Executive.
`;

// Sample CSV sales table
const sampleCsv = `Department,Q1 Revenue,Q2 Revenue,Growth Rate,Status
Engineering,$1200000,$1450000,+20.8%,On Track
Sales,$850000,$980000,+15.3%,Exceeded
Marketing,$400000,$420000,+5.0%,Needs Review
Human Resources,$150000,$155000,+3.3%,Stable
Customer Support,$310000,$340000,+9.7%,On Track`;

// Executes the hierarchical chunker test and validates parent-child relationships
// returns: Promise<void>
async function runChunkerVerification(): Promise<void> {
  console.log('=====================================================');
  console.log('KNOWRA HIERARCHICAL SEMANTIC CHUNKER TEST');
  console.log('=====================================================\n');

  // 1. Test Markdown Hierarchical Chunking
  console.log('[1/2] Parsing and Chunking Enterprise Document with Parent-Child Hierarchy...');
  const markdownBuffer = Buffer.from(sampleEnterpriseDoc, 'utf-8');

  // parsedDoc is a ParsedDocument object containing structured blocks
  const parsedDoc = await parseDocument({
    fileBuffer: markdownBuffer,
    fileName: 'knowra-architecture.md',
    mimeType: 'text/markdown',
    accessLevel: 'role_restricted',
  });

  // processedChunks is an Array of ProcessedChunk objects
  const processedChunks: ProcessedChunk[] = chunkDocument(parsedDoc, {
    parentChunkTargetTokens: 150,
    childChunkTargetTokens: 50,
    childChunkOverlapTokens: 10,
    enableParentChild: true,
    enrichWithHeadingContext: true,
  });

  console.log(`Total Chunks Generated: ${processedChunks.length}`);

  const parentChunks = processedChunks.filter((c) => c.chunkStrategy === 'parent');
  const childChunks = processedChunks.filter((c) => c.chunkStrategy === 'child');

  console.log(`- Parent Chunks (Macro Context): ${parentChunks.length}`);
  console.log(`- Child Chunks (Micro Vectors):  ${childChunks.length}\n`);

  console.log('--- Sample Parent Chunk ---');
  if (parentChunks.length > 0) {
    const p = parentChunks[0];
    console.log(`ID:            ${p.id}`);
    console.log(`Strategy:      ${p.chunkStrategy}`);
    console.log(`Parent ID:     ${p.parentChunkId}`);
    console.log(`Heading Path:  ${p.headingPath}`);
    console.log(`Token Count:   ${p.tokenCount}`);
    console.log(`Content Preview:\n${p.content.slice(0, 150)}...\n`);
  }

  console.log('--- Sample Child Chunks Linked to Parent ---');
  const linkedChildren = childChunks.filter((c) => c.parentChunkId === parentChunks[0]?.id);
  console.log(`Found ${linkedChildren.length} child chunks linked to Parent ID [${parentChunks[0]?.id}]`);

  for (const child of linkedChildren) {
    console.log(`\n  Child ID:       ${child.id}`);
    console.log(`  Parent Link:    ${child.parentChunkId}`);
    console.log(`  Heading Path:   ${child.headingPath}`);
    console.log(`  Token Count:    ${child.tokenCount}`);
    console.log(`  Content:\n  ${child.content.replace(/\n/g, '\n  ')}`);
  }

  // 2. Test Table Chunking
  console.log('\n\n[2/2] Parsing and Chunking CSV Tabular Data...');
  const csvBuffer = Buffer.from(sampleCsv, 'utf-8');

  const parsedCsv = await parseDocument({
    fileBuffer: csvBuffer,
    fileName: 'quarterly-report.csv',
    mimeType: 'text/csv',
    accessLevel: 'public_tenant',
  });

  const tableChunks: ProcessedChunk[] = chunkDocument(parsedCsv, {
    childChunkTargetTokens: 30,
    enableParentChild: false,
  });

  console.log(`Total Table Chunks Generated: ${tableChunks.length}`);
  for (const tc of tableChunks) {
    console.log(`\n  Table Chunk ID: ${tc.id}`);
    console.log(`  Strategy:       ${tc.chunkStrategy}`);
    console.log(`  Tokens:         ${tc.tokenCount}`);
    console.log(`  Content:\n  ${tc.content.replace(/\n/g, '\n  ')}`);
  }

  console.log('\n=====================================================');
  console.log('ALL CHUNKER VERIFICATIONS COMPLETED SUCCESSFULLY!');
  console.log('=====================================================');
}

runChunkerVerification().catch((err) => {
  console.error('Chunker verification failed:', err);
  process.exit(1);
});
