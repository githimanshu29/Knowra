// Drizzle SQL template operator and comparison functions
import { eq, sql } from 'drizzle-orm';
// Main database client instance
import { db } from '../../db/index.js';
// Drizzle schemas for documents, versions, chunks, and jobs
import { chunks, documents, documentVersions, ingestionJobs } from '../../db/schema/index.js';
// Disk storage reader
import { readFile } from '../storage.service.js';
// Semantic parser
import { parseDocument } from './parsers.js';
// Hierarchical chunker
import { chunkDocument } from './chunker.js';
// Vector embedder
import { batchGenerateEmbeddings } from './embedder.js';
// Validated environment variables
import { env } from '../../config/env.js';

// Batch size for inserting chunk records into PostgreSQL
const CHUNK_INSERT_BATCH_SIZE = 25;

// TypeScript Concept: Asynchronous Job Execution Result
// Describes the outcome of an ingestion worker job execution
export interface IngestionJobResult {
  jobId: string;
  documentId: string;
  totalChunks: number;
  status: 'COMPLETED' | 'FAILED';
  errorMessage?: string;
}

// Executes the complete ingestion pipeline for a queued job
// returns: Promise<IngestionJobResult>
export async function processIngestionJob(jobId: string): Promise<IngestionJobResult> {
  // jobRecord is a single object { id: string, tenantId: string, documentId: string, status: string, ... } or undefined
  const jobRecord = await db.query.ingestionJobs.findFirst({
    where: eq(ingestionJobs.id, jobId),
  });

  if (!jobRecord) {
    throw new Error(`Ingestion job not found for id: ${jobId}`);
  }

  try {
    // 1. Mark job as PROCESSING at 10 percent
    await db
      .update(ingestionJobs)
      .set({ status: 'PROCESSING', progressPercent: 10, updatedAt: new Date() })
      .where(eq(ingestionJobs.id, jobId));

    // docRecord is a single object { id: string, filename: string, storagePath: string, ... }
    const docRecord = await db.query.documents.findFirst({
      where: eq(documents.id, jobRecord.documentId),
    });

    if (!docRecord) {
      throw new Error(`Document not found for id: ${jobRecord.documentId}`);
    }

    // versionRecord is a single object { id: string, documentId: string, versionNumber: number, ... }
    const versionRecord = await db.query.documentVersions.findFirst({
      where: eq(documentVersions.documentId, docRecord.id),
    });

    if (!versionRecord) {
      throw new Error(`Document version not found for document id: ${docRecord.id}`);
    }

    await db
      .update(documents)
      .set({ status: 'PROCESSING', updatedAt: new Date() })
      .where(eq(documents.id, docRecord.id));

    // 2. Read file binary buffer from disk storage path
    const fileBuffer = await readFile(docRecord.storagePath);

    // 3. Parse file into semantic blocks at 30 percent progress
    await db
      .update(ingestionJobs)
      .set({ progressPercent: 30, updatedAt: new Date() })
      .where(eq(ingestionJobs.id, jobId));

    // parsedDoc is a ParsedDocument object
    const parsedDoc = await parseDocument({
      fileBuffer,
      fileName: docRecord.filename,
      mimeType: docRecord.mimeType,
      accessLevel: 'public_tenant',
    });

    // 4. Generate hierarchical parent and child chunks at 50 percent progress
    await db
      .update(ingestionJobs)
      .set({ progressPercent: 50, updatedAt: new Date() })
      .where(eq(ingestionJobs.id, jobId));

    // processedChunks is an Array of ProcessedChunk objects
    const processedChunks = chunkDocument(parsedDoc, {
      enableParentChild: true,
      enrichWithHeadingContext: true,
    });

    if (processedChunks.length === 0) {
      throw new Error(`Document parsing produced 0 chunks for file: ${docRecord.filename}`);
    }

    // 5. Generate 1536-dimensional vector embeddings at 70 percent progress
    await db
      .update(ingestionJobs)
      .set({ progressPercent: 70, updatedAt: new Date() })
      .where(eq(ingestionJobs.id, jobId));

    const chunkTexts = processedChunks.map((c) => c.content);
    // embeddings is an Array of 1536-dimensional float arrays
    const embeddings = await batchGenerateEmbeddings(chunkTexts, 64);

    // 6. Batch insert chunks with vector and tsvector into PostgreSQL at 85 percent progress
    await db
      .update(ingestionJobs)
      .set({ progressPercent: 85, updatedAt: new Date() })
      .where(eq(ingestionJobs.id, jobId));

    for (let i = 0; i < processedChunks.length; i += CHUNK_INSERT_BATCH_SIZE) {
      const chunkBatch = processedChunks.slice(i, i + CHUNK_INSERT_BATCH_SIZE);

      const rowsToInsert = chunkBatch.map((chunk, sliceIdx) => {
        const globalIdx = i + sliceIdx;
        return {
          id: chunk.id,
          tenantId: docRecord.tenantId,
          documentId: docRecord.id,
          versionId: versionRecord.id,
          parentChunkId: chunk.parentChunkId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          pageNumber: chunk.pageNumber,
          sectionHeading: chunk.sectionHeading,
          headingPath: chunk.headingPath,
          chunkStrategy: chunk.chunkStrategy,
          embedding: embeddings[globalIdx],
          embeddingModel: env.EMBEDDING_MODEL,
          embeddingDimension: env.EMBEDDING_DIMENSION,
          searchVector: sql`to_tsvector('english', ${chunk.content})`,
        };
      });

      await db.insert(chunks).values(rowsToInsert);
    }

    // 7. Finalize document and job statuses at 100 percent
    const summarySnippet = parsedDoc.blocks
      .slice(0, 3)
      .map((b) => b.content)
      .join(' ')
      .slice(0, 500);

    await db
      .update(documentVersions)
      .set({ summary: summarySnippet, updatedAt: new Date() })
      .where(eq(documentVersions.id, versionRecord.id));

    await db
      .update(documents)
      .set({ status: 'READY', updatedAt: new Date() })
      .where(eq(documents.id, docRecord.id));

    await db
      .update(ingestionJobs)
      .set({
        status: 'COMPLETED',
        progressPercent: 100,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, jobId));

    return {
      jobId,
      documentId: docRecord.id,
      totalChunks: processedChunks.length,
      status: 'COMPLETED',
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.error(`Ingestion processing error for job ${jobId}:`, errorMsg);

    await db
      .update(ingestionJobs)
      .set({
        status: 'FAILED',
        errorMessage: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, jobId));

    await db
      .update(documents)
      .set({
        status: 'ERROR',
        errorMessage: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, jobRecord.documentId));

    return {
      jobId,
      documentId: jobRecord.documentId,
      totalChunks: 0,
      status: 'FAILED',
      errorMessage: errorMsg,
    };
  }
}

// Triggers the ingestion job asynchronously in background without blocking HTTP response
// returns: void
export function triggerIngestionWorker(jobId: string): void {
  // Dispatches async execution immediately on event loop
  processIngestionJob(jobId).catch((err) => {
    console.error(`Background ingestion job ${jobId} failed unhandled:`, err);
  });
}

// Recovers any ingestion jobs left in PROCESSING status across server restarts
// returns: Promise<number> count of recovered jobs
export async function recoverStuckIngestionJobs(): Promise<number> {
  const stuckJobs = await db.query.ingestionJobs.findMany({
    where: eq(ingestionJobs.status, 'PROCESSING'),
  });

  if (stuckJobs.length === 0) return 0;

  for (const job of stuckJobs) {
    await db
      .update(ingestionJobs)
      .set({
        status: 'FAILED',
        errorMessage: 'Job interrupted by server restart',
        updatedAt: new Date(),
      })
      .where(eq(ingestionJobs.id, job.id));

    await db
      .update(documents)
      .set({
        status: 'ERROR',
        errorMessage: 'Ingestion interrupted by server restart',
        updatedAt: new Date(),
      })
      .where(eq(documents.id, job.documentId));
  }

  return stuckJobs.length;
}
