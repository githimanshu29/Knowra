// Node crypto module for generating standard UUID v4 strings
import { randomUUID } from 'crypto';
// SemanticBlock and DocumentChunkMetadata imported from parsers
import { SemanticBlock, DocumentChunkMetadata, ParsedDocument } from './parsers.js';

// TypeScript Concept: Interface
// Defines the exact shape of a processed chunk ready for vector embedding and database insertion
export interface ProcessedChunk {
  id: string;
  parentChunkId: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber: number;
  sectionHeading: string | null;
  headingPath: string | null;
  chunkStrategy: 'parent' | 'child' | 'semantic' | 'table';
  metadata: DocumentChunkMetadata;
}

// TypeScript Concept: Optional Interface Properties
// Chunker configuration options with sensible enterprise RAG defaults
export interface ChunkerOptions {
  parentChunkTargetTokens?: number;
  parentChunkOverlapTokens?: number;
  childChunkTargetTokens?: number;
  childChunkOverlapTokens?: number;
  enableParentChild?: boolean;
  enrichWithHeadingContext?: boolean;
}

// Default configuration constants for hierarchical chunking
const DEFAULT_PARENT_TARGET_TOKENS = 800;
const DEFAULT_CHILD_TARGET_TOKENS = 200;
const DEFAULT_CHILD_OVERLAP_TOKENS = 30;

// Approximates token count using standard 4 characters per token heuristic
// returns: number
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Converts array of heading strings into a breadcrumb path like Topic > Subtopic
// returns: string
export function formatHeadingBreadcrumb(headingPath?: string[]): string {
  if (!headingPath || headingPath.length === 0) return '';
  return headingPath.join(' > ');
}

// Enriches text content by prepending the hierarchical section heading context
// returns: string
export function enrichContentWithContext(content: string, breadcrumb: string): string {
  if (!breadcrumb) return content;
  return `[Context: ${breadcrumb}]\n${content}`;
}

// Splits a large text into sentence-aware units without breaking mid-sentence
// returns: string[]
function splitIntoSentences(text: string): string[] {
  // Regex splits on period question mark or exclamation mark followed by space or newline
  const rawSentences = text.split(/(?<=[.?!])\s+/);
  const result: string[] = [];

  for (const sentence of rawSentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }

  // result is an Array of String sentences
  return result;
}

// Splits text content into overlapping child chunks respecting sentence boundaries
// returns: string[]
function splitTextIntoChildWindows(
  text: string,
  targetTokens: number,
  overlapTokens: number
): string[] {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let currentWindow: string[] = [];
  let currentWindowTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokenCount(sentence);

    // If single sentence exceeds target tokens split it by character chunks
    if (sentenceTokens > targetTokens) {
      if (currentWindow.length > 0) {
        chunks.push(currentWindow.join(' '));
        currentWindow = [];
        currentWindowTokens = 0;
      }
      const charChunkSize = targetTokens * 4;
      for (let i = 0; i < sentence.length; i += charChunkSize) {
        chunks.push(sentence.slice(i, i + charChunkSize));
      }
      continue;
    }

    if (currentWindowTokens + sentenceTokens > targetTokens && currentWindow.length > 0) {
      chunks.push(currentWindow.join(' '));

      // Calculate overlap by retaining recent sentences that fit within overlap budget
      const retainedSentences: string[] = [];
      let retainedTokens = 0;

      for (let i = currentWindow.length - 1; i >= 0; i--) {
        const candidateTokens = estimateTokenCount(currentWindow[i]);
        if (retainedTokens + candidateTokens <= overlapTokens) {
          retainedSentences.unshift(currentWindow[i]);
          retainedTokens += candidateTokens;
        } else {
          break;
        }
      }

      currentWindow = retainedSentences;
      currentWindowTokens = retainedTokens;
    }

    currentWindow.push(sentence);
    currentWindowTokens += sentenceTokens;
  }

  if (currentWindow.length > 0) {
    chunks.push(currentWindow.join(' '));
  }

  // chunks is an Array of String chunk bodies
  return chunks;
}

// Chunks a tabular block preserving row units and column context
// returns: ProcessedChunk[]
function chunkTableBlock(
  block: SemanticBlock,
  startIndex: number,
  options: ChunkerOptions
): ProcessedChunk[] {
  const result: ProcessedChunk[] = [];
  const lines = block.content.split('\n').filter((l) => l.trim().length > 0);
  const breadcrumb = formatHeadingBreadcrumb(block.metadata.headingPath);

  // If table is compact keep it intact as a single atomic chunk
  const totalTokens = estimateTokenCount(block.content);
  const childTarget = options.childChunkTargetTokens || DEFAULT_CHILD_TARGET_TOKENS;

  if (totalTokens <= childTarget * 2) {
    const enrichedContent = options.enrichWithHeadingContext !== false
      ? enrichContentWithContext(block.content, breadcrumb)
      : block.content;

    result.push({
      id: randomUUID(),
      parentChunkId: null,
      chunkIndex: startIndex,
      content: enrichedContent,
      tokenCount: estimateTokenCount(enrichedContent),
      pageNumber: block.metadata.page,
      sectionHeading: block.metadata.sectionHeading || null,
      headingPath: breadcrumb || null,
      chunkStrategy: 'table',
      metadata: block.metadata,
    });

    // result is an Array with 1 ProcessedChunk
    return result;
  }

  // If table is large slice row batches preserving header row context
  const headerLine = lines[0] || 'Table Record';
  const dataLines = lines.slice(1);
  let batchRows: string[] = [];
  let batchTokens = estimateTokenCount(headerLine);
  let currentIndex = startIndex;

  for (const row of dataLines) {
    const rowTokens = estimateTokenCount(row);
    if (batchTokens + rowTokens > childTarget && batchRows.length > 0) {
      const tableSlice = `${headerLine}\n${batchRows.join('\n')}`;
      const enrichedSlice = options.enrichWithHeadingContext !== false
        ? enrichContentWithContext(tableSlice, breadcrumb)
        : tableSlice;

      result.push({
        id: randomUUID(),
        parentChunkId: null,
        chunkIndex: currentIndex++,
        content: enrichedSlice,
        tokenCount: estimateTokenCount(enrichedSlice),
        pageNumber: block.metadata.page,
        sectionHeading: block.metadata.sectionHeading || null,
        headingPath: breadcrumb || null,
        chunkStrategy: 'table',
        metadata: block.metadata,
      });

      batchRows = [];
      batchTokens = estimateTokenCount(headerLine);
    }

    batchRows.push(row);
    batchTokens += rowTokens;
  }

  if (batchRows.length > 0) {
    const tableSlice = `${headerLine}\n${batchRows.join('\n')}`;
    const enrichedSlice = options.enrichWithHeadingContext !== false
      ? enrichContentWithContext(tableSlice, breadcrumb)
      : tableSlice;

    result.push({
      id: randomUUID(),
      parentChunkId: null,
      chunkIndex: currentIndex++,
      content: enrichedSlice,
      tokenCount: estimateTokenCount(enrichedSlice),
      pageNumber: block.metadata.page,
      sectionHeading: block.metadata.sectionHeading || null,
      headingPath: breadcrumb || null,
      chunkStrategy: 'table',
      metadata: block.metadata,
    });
  }

  // result is an Array of ProcessedChunk objects representing sliced table segments
  return result;
}

// Core hierarchical chunker producing parent macro chunks and contextual child micro chunks
// returns: ProcessedChunk[]
export function chunkDocument(
  parsedDoc: ParsedDocument,
  options: ChunkerOptions = {}
): ProcessedChunk[] {
  const enableParentChild = options.enableParentChild !== false;
  const enrichWithHeading = options.enrichWithHeadingContext !== false;
  const parentTarget = options.parentChunkTargetTokens || DEFAULT_PARENT_TARGET_TOKENS;
  const childTarget = options.childChunkTargetTokens || DEFAULT_CHILD_TARGET_TOKENS;
  const childOverlap = options.childChunkOverlapTokens || DEFAULT_CHILD_OVERLAP_TOKENS;

  const finalChunks: ProcessedChunk[] = [];
  let chunkIndexCounter = 0;

  // Group contiguous semantic blocks into cohesive parent topic sections
  interface ParentAccumulator {
    blocks: SemanticBlock[];
    totalTokens: number;
    breadcrumb: string;
    sectionHeading: string | null;
    page: number;
  }

  const parentSections: ParentAccumulator[] = [];
  let currentParent: ParentAccumulator = {
    blocks: [],
    totalTokens: 0,
    breadcrumb: '',
    sectionHeading: null,
    page: 1,
  };

  for (const block of parsedDoc.blocks) {
    // If block is a dedicated table process it directly via chunkTableBlock
    if (block.blockType === 'table') {
      if (currentParent.blocks.length > 0) {
        parentSections.push({ ...currentParent });
        currentParent = {
          blocks: [],
          totalTokens: 0,
          breadcrumb: '',
          sectionHeading: null,
          page: block.metadata.page,
        };
      }

      const tableChunks = chunkTableBlock(block, chunkIndexCounter, options);
      for (const tc of tableChunks) {
        finalChunks.push(tc);
        chunkIndexCounter++;
      }
      continue;
    }

    const blockTokens = estimateTokenCount(block.content);
    const blockBreadcrumb = formatHeadingBreadcrumb(block.metadata.headingPath);

    // If block is a major heading or parent token capacity is reached start a new parent section
    const isHeading = block.blockType === 'heading';
    const isExceedingCapacity = currentParent.totalTokens + blockTokens > parentTarget;

    if ((isHeading && currentParent.blocks.length > 0) || isExceedingCapacity) {
      parentSections.push({ ...currentParent });
      currentParent = {
        blocks: [block],
        totalTokens: blockTokens,
        breadcrumb: blockBreadcrumb,
        sectionHeading: block.metadata.sectionHeading || null,
        page: block.metadata.page,
      };
    } else {
      if (currentParent.blocks.length === 0) {
        currentParent.breadcrumb = blockBreadcrumb;
        currentParent.sectionHeading = block.metadata.sectionHeading || null;
        currentParent.page = block.metadata.page;
      }
      currentParent.blocks.push(block);
      currentParent.totalTokens += blockTokens;
    }
  }

  if (currentParent.blocks.length > 0) {
    parentSections.push(currentParent);
  }

  // Iterate over parent sections to build parent and child chunks
  for (const section of parentSections) {
    if (section.blocks.length === 0) continue;

    // Combine section text
    const combinedSectionText = section.blocks
      .map((b) => b.content)
      .join('\n\n');

    const parentId = randomUUID();
    const firstBlock = section.blocks[0];

    if (enableParentChild) {
      // 1. Create Parent Chunk for comprehensive context retrieval
      const parentEnriched = enrichWithHeading
        ? enrichContentWithContext(combinedSectionText, section.breadcrumb)
        : combinedSectionText;

      const parentChunk: ProcessedChunk = {
        id: parentId,
        parentChunkId: null,
        chunkIndex: chunkIndexCounter++,
        content: parentEnriched,
        tokenCount: estimateTokenCount(parentEnriched),
        pageNumber: section.page,
        sectionHeading: section.sectionHeading,
        headingPath: section.breadcrumb || null,
        chunkStrategy: 'parent',
        metadata: firstBlock.metadata,
      };

      finalChunks.push(parentChunk);

      // 2. Create Child Chunks linked to this Parent Chunk
      const childWindows = splitTextIntoChildWindows(
        combinedSectionText,
        childTarget,
        childOverlap
      );

      for (const windowText of childWindows) {
        const childEnriched = enrichWithHeading
          ? enrichContentWithContext(windowText, section.breadcrumb)
          : windowText;

        const childChunk: ProcessedChunk = {
          id: randomUUID(),
          parentChunkId: parentId,
          chunkIndex: chunkIndexCounter++,
          content: childEnriched,
          tokenCount: estimateTokenCount(childEnriched),
          pageNumber: section.page,
          sectionHeading: section.sectionHeading,
          headingPath: section.breadcrumb || null,
          chunkStrategy: 'child',
          metadata: firstBlock.metadata,
        };

        finalChunks.push(childChunk);
      }
    } else {
      // Flat semantic chunking without parent hierarchy
      const textWindows = splitTextIntoChildWindows(
        combinedSectionText,
        childTarget,
        childOverlap
      );

      for (const windowText of textWindows) {
        const enriched = enrichWithHeading
          ? enrichContentWithContext(windowText, section.breadcrumb)
          : windowText;

        finalChunks.push({
          id: randomUUID(),
          parentChunkId: null,
          chunkIndex: chunkIndexCounter++,
          content: enriched,
          tokenCount: estimateTokenCount(enriched),
          pageNumber: section.page,
          sectionHeading: section.sectionHeading,
          headingPath: section.breadcrumb || null,
          chunkStrategy: 'semantic',
          metadata: firstBlock.metadata,
        });
      }
    }
  }

  // finalChunks is an Array of ProcessedChunk objects ready for embedding and storage
  return finalChunks;
}
