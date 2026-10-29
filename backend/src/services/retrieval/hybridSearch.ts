// Drizzle SQL template operator and comparison functions
import { inArray, sql } from 'drizzle-orm';
// Main database client instance
import { db } from '../../db/index.js';
// Validated environment variables
import { env } from '../../config/env.js';
// Chunks schema table
import { chunks } from '../../db/schema/index.js';
// Vector embedder for query embedding
import { generateEmbedding } from '../ingestion/embedder.js';

// TypeScript Concept: Interface
// Defines input parameters for multi-tenant hybrid retrieval
export interface HybridSearchOptions {
  query: string;
  tenantId: string;
  userId?: string;
  roleIds?: string[];
  isSuperAdmin?: boolean;
  documentId?: string;
  vectorCandidateK?: number;
  lexicalCandidateK?: number;
  rrfKConstant?: number;
  limit?: number;
}

// TypeScript Concept: Nested Interface
// Encapsulates surrounding macro context from the parent chunk
export interface ParentChunkContext {
  id: string;
  content: string;
  tokenCount: number;
  sectionHeading: string | null;
  headingPath: string | null;
}

// TypeScript Concept: Fused Result Structure
// Combines vector cosine score, lexical rank, and RRF score with parent context
export interface HybridSearchResult {
  id: string;
  tenantId: string;
  documentId: string;
  documentTitle: string;
  documentFilename: string;
  versionId: string;
  parentChunkId: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber: number | null;
  sectionHeading: string | null;
  headingPath: string | null;
  chunkStrategy: string;
  rrfScore: number;
  vectorRank: number | null;
  lexicalRank: number | null;
  vectorScore: number | null;
  lexicalScore: number | null;
  parentChunk: ParentChunkContext | null;
}

// Internal candidate row returned by PostgreSQL raw queries
interface RawCandidateRow {
  id: string;
  tenant_id: string;
  document_id: string;
  document_title?: string;
  document_filename?: string;
  version_id: string;
  parent_chunk_id: string | null;
  chunk_index: number;
  content: string;
  token_count: number;
  page_number: number | null;
  section_heading: string | null;
  heading_path: string | null;
  chunk_strategy: string;
  score?: number;
}

// Executes dense vector search using pgvector cosine distance operator
// returns: Promise<Array<RawCandidateRow & { vectorScore: number }>>
export async function executeVectorBranch(
  queryVector: number[],
  tenantId: string,
  candidateK: number,
  userId?: string,
  roleIds?: string[],
  isSuperAdmin?: boolean,
  documentId?: string
): Promise<Array<RawCandidateRow & { vectorScore: number }>> {
  const vectorStr = `[${queryVector.join(',')}]`;

  // Builds authorized vector query with multi-tenant and RBAC filters
  // rawVectorRows is an Array of Objects returned by the pg driver
  const rawVectorRows = await db.execute(sql`
    SELECT 
      c.id,
      c.tenant_id,
      c.document_id,
      d.title AS document_title,
      d.filename AS document_filename,
      c.version_id,
      c.parent_chunk_id,
      c.chunk_index,
      c.content,
      c.token_count,
      c.page_number,
      c.section_heading,
      c.heading_path,
      c.chunk_strategy,
      1 - (c.embedding <=> ${vectorStr}::vector) AS score
    FROM chunks c
    INNER JOIN documents d ON c.document_id = d.id
    WHERE c.tenant_id = ${tenantId}
      AND d.status = 'READY'
      AND c.chunk_strategy IN ('child', 'table', 'semantic')
      ${documentId ? sql`AND c.document_id = ${documentId}` : sql``}
      ${
        isSuperAdmin
          ? sql``
          : sql`AND (
              d.is_public_within_tenant = true
              ${userId ? sql`OR d.created_by = ${userId}` : sql``}
              ${
                userId
                  ? sql`OR EXISTS (
                      SELECT 1 FROM document_permissions dp 
                      WHERE dp.document_id = d.id 
                        AND (
                          dp.user_id = ${userId}
                          ${roleIds && roleIds.length > 0 ? sql`OR dp.role_id IN (${sql.join(roleIds.map((r) => sql`${r}::uuid`), sql`, `)})` : sql``}
                        )
                    )`
                  : sql``
              }
            )`
      }
    ORDER BY c.embedding <=> ${vectorStr}::vector ASC
    LIMIT ${candidateK};
  `);

  const results: Array<RawCandidateRow & { vectorScore: number }> = [];
  for (const row of rawVectorRows.rows) {
    const r = row as unknown as RawCandidateRow & { score: number };
    results.push({
      ...r,
      vectorScore: Number(r.score),
    });
  }

  // results is an Array of RawCandidateRow objects with vectorScore
  return results;
}

// Executes sparse lexical full text search using tsvector GIN index
// returns: Promise<Array<RawCandidateRow & { lexicalScore: number }>>
export async function executeLexicalBranch(
  cleanQuery: string,
  tenantId: string,
  candidateK: number,
  userId?: string,
  roleIds?: string[],
  isSuperAdmin?: boolean,
  documentId?: string
): Promise<Array<RawCandidateRow & { lexicalScore: number }>> {
  if (!cleanQuery || cleanQuery.length === 0) return [];

  // Extract non-stopword alphanumeric keywords for flexible OR prefix matching
  const keywords = cleanQuery
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);

  const orQueryTerms = keywords.map((k) => `${k}:*`).join(' | ');

  // rawLexicalRows is an Array of Objects returned by the pg driver
  const rawLexicalRows = await db.execute(sql`
    SELECT 
      c.id,
      c.tenant_id,
      c.document_id,
      d.title AS document_title,
      d.filename AS document_filename,
      c.version_id,
      c.parent_chunk_id,
      c.chunk_index,
      c.content,
      c.token_count,
      c.page_number,
      c.section_heading,
      c.heading_path,
      c.chunk_strategy,
      ts_rank_cd(c.search_vector, websearch_to_tsquery('english', ${cleanQuery})) + 
      ${orQueryTerms.length > 0 ? sql`0.5 * ts_rank_cd(c.search_vector, to_tsquery('english', ${orQueryTerms}))` : sql`0`} AS score
    FROM chunks c
    INNER JOIN documents d ON c.document_id = d.id
    WHERE c.tenant_id = ${tenantId}
      AND d.status = 'READY'
      AND c.chunk_strategy IN ('child', 'table', 'semantic')
      ${documentId ? sql`AND c.document_id = ${documentId}` : sql``}
      AND (
        c.search_vector @@ websearch_to_tsquery('english', ${cleanQuery})
        ${orQueryTerms.length > 0 ? sql`OR c.search_vector @@ to_tsquery('english', ${orQueryTerms})` : sql``}
      )
      ${
        isSuperAdmin
          ? sql``
          : sql`AND (
              d.is_public_within_tenant = true
              ${userId ? sql`OR d.created_by = ${userId}` : sql``}
              ${
                userId
                  ? sql`OR EXISTS (
                      SELECT 1 FROM document_permissions dp 
                      WHERE dp.document_id = d.id 
                        AND (
                          dp.user_id = ${userId}
                          ${roleIds && roleIds.length > 0 ? sql`OR dp.role_id IN (${sql.join(roleIds.map((r) => sql`${r}::uuid`), sql`, `)})` : sql``}
                        )
                    )`
                  : sql``
              }
            )`
      }
    ORDER BY score DESC
    LIMIT ${candidateK};
  `);

  const results: Array<RawCandidateRow & { lexicalScore: number }> = [];
  for (const row of rawLexicalRows.rows) {
    const r = row as unknown as RawCandidateRow & { score: number };
    results.push({
      ...r,
      lexicalScore: Number(r.score),
    });
  }

  // results is an Array of RawCandidateRow objects with lexicalScore
  return results;
}

// Fetches macro parent chunk records in batch to enrich child candidates
// returns: Promise<Map<string, ParentChunkContext>>
async function fetchParentChunksBatch(
  parentIds: string[],
  tenantId: string
): Promise<Map<string, ParentChunkContext>> {
  const map = new Map<string, ParentChunkContext>();
  if (parentIds.length === 0) return map;

  // parentRows is an Array of Objects from chunks table
  const parentRows = await db
    .select({
      id: chunks.id,
      content: chunks.content,
      tokenCount: chunks.tokenCount,
      sectionHeading: chunks.sectionHeading,
      headingPath: chunks.headingPath,
    })
    .from(chunks)
    .where(inArray(chunks.id, parentIds));

  for (const row of parentRows) {
    map.set(row.id, {
      id: row.id,
      content: row.content,
      tokenCount: row.tokenCount,
      sectionHeading: row.sectionHeading,
      headingPath: row.headingPath,
    });
  }

  // map maps parentChunkId string to ParentChunkContext
  return map;
}

// Executes hybrid search combining pgvector, tsvector, Reciprocal Rank Fusion, and Parent Swap
// returns: Promise<HybridSearchResult[]>
export async function hybridSearch(options: HybridSearchOptions): Promise<HybridSearchResult[]> {
  const {
    query,
    tenantId,
    userId,
    roleIds,
    isSuperAdmin = false,
    documentId,
    vectorCandidateK = env.VECTOR_CANDIDATE_K,
    lexicalCandidateK = env.LEXICAL_CANDIDATE_K,
    rrfKConstant = env.RRF_K_CONSTANT,
    limit = 5,
  } = options;

  if (!query || query.trim().length === 0) return [];

  // 1. Generate query vector embedding for dense search branch
  const queryVector = await generateEmbedding(query);
  const cleanLexicalQuery = query.replace(/[^\w\s]/g, ' ').trim();

  // 2. Execute parallel vector and lexical search branches
  const [vectorCandidates, lexicalCandidates] = await Promise.all([
    executeVectorBranch(queryVector, tenantId, vectorCandidateK, userId, roleIds, isSuperAdmin, documentId),
    executeLexicalBranch(cleanLexicalQuery, tenantId, lexicalCandidateK, userId, roleIds, isSuperAdmin, documentId),
  ]);

  // 3. Compute Reciprocal Rank Fusion scores across both candidate lists
  interface FusionAccumulator {
    candidate: RawCandidateRow;
    rrfScore: number;
    vectorRank: number | null;
    lexicalRank: number | null;
    vectorScore: number | null;
    lexicalScore: number | null;
  }

  const fusionMap = new Map<string, FusionAccumulator>();

  // Process dense vector rankings
  for (let rank = 1; rank <= vectorCandidates.length; rank++) {
    const item = vectorCandidates[rank - 1];
    const rrfContribution = 1.0 / (rrfKConstant + rank);

    const existing = fusionMap.get(item.id);
    if (existing) {
      existing.rrfScore += rrfContribution;
      existing.vectorRank = rank;
      existing.vectorScore = item.vectorScore;
    } else {
      fusionMap.set(item.id, {
        candidate: item,
        rrfScore: rrfContribution,
        vectorRank: rank,
        lexicalRank: null,
        vectorScore: item.vectorScore,
        lexicalScore: null,
      });
    }
  }

  // Process sparse lexical rankings
  for (let rank = 1; rank <= lexicalCandidates.length; rank++) {
    const item = lexicalCandidates[rank - 1];
    const rrfContribution = 1.0 / (rrfKConstant + rank);

    const existing = fusionMap.get(item.id);
    if (existing) {
      existing.rrfScore += rrfContribution;
      existing.lexicalRank = rank;
      existing.lexicalScore = item.lexicalScore;
    } else {
      fusionMap.set(item.id, {
        candidate: item,
        rrfScore: rrfContribution,
        vectorRank: null,
        lexicalRank: rank,
        vectorScore: null,
        lexicalScore: item.lexicalScore,
      });
    }
  }

  // 4. Sort candidates descending by fused RRF score
  const sortedAccumulators = Array.from(fusionMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);

  // 5. Collect parent chunk ids for context expansion
  const neededParentIds: string[] = [];
  for (const item of sortedAccumulators) {
    if (item.candidate.chunk_strategy === 'child' && item.candidate.parent_chunk_id) {
      neededParentIds.push(item.candidate.parent_chunk_id);
    }
  }

  const uniqueParentIds = Array.from(new Set(neededParentIds));
  const parentMap = await fetchParentChunksBatch(uniqueParentIds, tenantId);

  // 6. Build final structured results with parent chunk enrichment
  const finalResults: HybridSearchResult[] = [];
  for (const item of sortedAccumulators) {
    const c = item.candidate;
    const parentContext = c.parent_chunk_id ? parentMap.get(c.parent_chunk_id) || null : null;

    finalResults.push({
      id: c.id,
      tenantId: c.tenant_id,
      documentId: c.document_id,
      documentTitle: c.document_title || c.document_filename || 'Knowledge Document',
      documentFilename: c.document_filename || '',
      versionId: c.version_id,
      parentChunkId: c.parent_chunk_id,
      chunkIndex: c.chunk_index,
      content: c.content,
      tokenCount: c.token_count,
      pageNumber: c.page_number,
      sectionHeading: c.section_heading,
      headingPath: c.heading_path,
      chunkStrategy: c.chunk_strategy,
      rrfScore: item.rrfScore,
      vectorRank: item.vectorRank,
      lexicalRank: item.lexicalRank,
      vectorScore: item.vectorScore,
      lexicalScore: item.lexicalScore,
      parentChunk: parentContext,
    });
  }

  // finalResults is an Array of HybridSearchResult objects sorted by rrfScore descending
  return finalResults;
}
