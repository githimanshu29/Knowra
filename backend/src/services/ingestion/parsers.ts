// Node module helper to import CommonJS modules in ESM
import { createRequire } from 'module';
// DOCX to HTML and structured text converter
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// TypeScript Concept: Union Type
// DocType restricts the string to only approved enterprise document formats
export type DocType = 'pdf' | 'docx' | 'txt' | 'csv' | 'markdown';
export type AccessLevel = 'public_tenant' | 'role_restricted' | 'user_restricted';

// Base metadata interface required for every ingested chunk and document
export interface DocumentChunkMetadata {
  source: string;
  page: number;
  timestamp: string;
  docType: DocType;
  accessLevel: AccessLevel;
  sectionHeading?: string;
  headingPath?: string[];
}

// Extracted structural block preserving semantics headings and tables
export interface SemanticBlock {
  content: string;
  metadata: DocumentChunkMetadata;
  blockType: 'heading' | 'paragraph' | 'table' | 'list';
}

// Full parsed document payload containing all semantic blocks
export interface ParsedDocument {
  source: string;
  docType: DocType;
  pageCount: number;
  totalBlocks: number;
  timestamp: string;
  accessLevel: AccessLevel;
  blocks: SemanticBlock[];
}

// Parses plain text or markdown buffer into semantic blocks with heading hierarchy
// returns: Array of SemanticBlock objects
function parseTextAndMarkdown(
  text: string,
  source: string,
  docType: DocType,
  timestamp: string,
  accessLevel: AccessLevel
): SemanticBlock[] {
  const blocks: SemanticBlock[] = [];
  const lines = text.split('\n');

  let currentHeadingPath: string[] = [];
  let currentParagraph = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      if (currentParagraph) {
        blocks.push({
          content: currentParagraph.trim(),
          blockType: 'paragraph',
          metadata: {
            source,
            page: 1,
            timestamp,
            docType,
            accessLevel,
            sectionHeading: currentHeadingPath[currentHeadingPath.length - 1],
            headingPath: [...currentHeadingPath],
          },
        });
        currentParagraph = '';
      }

      const headingText = line.replace(/^#+\s*/, '');
      const level = (line.match(/^#+/) || ['#'])[0].length;
      currentHeadingPath = currentHeadingPath.slice(0, level - 1);
      currentHeadingPath.push(headingText);

      blocks.push({
        content: headingText,
        blockType: 'heading',
        metadata: {
          source,
          page: 1,
          timestamp,
          docType,
          accessLevel,
          sectionHeading: headingText,
          headingPath: [...currentHeadingPath],
        },
      });
    } else {
      currentParagraph += (currentParagraph ? ' ' : '') + line;
    }
  }

  if (currentParagraph) {
    blocks.push({
      content: currentParagraph.trim(),
      blockType: 'paragraph',
      metadata: {
        source,
        page: 1,
        timestamp,
        docType,
        accessLevel,
        sectionHeading: currentHeadingPath[currentHeadingPath.length - 1],
        headingPath: [...currentHeadingPath],
      },
    });
  }

  return blocks;
}

// Parses PDF binary buffer with page-by-page extraction
// returns: Promise<ParsedDocument>
async function parsePdf(
  buffer: Buffer,
  source: string,
  timestamp: string,
  accessLevel: AccessLevel
): Promise<ParsedDocument> {
  const pageTexts: { page: number; text: string }[] = [];
  let pageCounter = 1;

  // Custom page renderer hook extracts text per exact page number
  await pdf(buffer, {
    pagerender: async (pageData: any): Promise<string> => {
      const textContent = await pageData.getTextContent();
      const pageString = textContent.items.map((item: any) => item.str).join(' ');
      pageTexts.push({ page: pageCounter++, text: pageString.trim() });
      return pageString;
    },
  });

  const blocks: SemanticBlock[] = [];

  for (const pageItem of pageTexts) {
    if (!pageItem.text) continue;
    const paragraphs = pageItem.text.split(/(?:\r?\n){2,}/);

    for (const paragraph of paragraphs) {
      const cleanContent = paragraph.trim();
      if (!cleanContent) continue;

      blocks.push({
        content: cleanContent,
        blockType: 'paragraph',
        metadata: {
          source,
          page: pageItem.page,
          timestamp,
          docType: 'pdf',
          accessLevel,
        },
      });
    }
  }

  return {
    source,
    docType: 'pdf',
    pageCount: pageTexts.length,
    totalBlocks: blocks.length,
    timestamp,
    accessLevel,
    blocks,
  };
}

// Parses Word DOCX binary buffer preserving headings and tables
// returns: Promise<ParsedDocument>
async function parseDocx(
  buffer: Buffer,
  source: string,
  timestamp: string,
  accessLevel: AccessLevel
): Promise<ParsedDocument> {
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const html = htmlResult.value;

  const blocks: SemanticBlock[] = [];
  let currentHeadingPath: string[] = [];

  // Match headings, paragraphs, lists, and tables in html output
  const elementRegex = /<(h[1-6]|p|li|table)[^>]*>(.*?)<\/\1>/gis;
  let match: RegExpExecArray | null;

  while ((match = elementRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const rawInner = match[2].replace(/<[^>]+>/g, '').trim();
    if (!rawInner) continue;

    if (tag.startsWith('h')) {
      const level = parseInt(tag.charAt(1), 10);
      currentHeadingPath = currentHeadingPath.slice(0, level - 1);
      currentHeadingPath.push(rawInner);

      blocks.push({
        content: rawInner,
        blockType: 'heading',
        metadata: {
          source,
          page: 1,
          timestamp,
          docType: 'docx',
          accessLevel,
          sectionHeading: rawInner,
          headingPath: [...currentHeadingPath],
        },
      });
    } else {
      blocks.push({
        content: rawInner,
        blockType: tag === 'table' ? 'table' : tag === 'li' ? 'list' : 'paragraph',
        metadata: {
          source,
          page: 1,
          timestamp,
          docType: 'docx',
          accessLevel,
          sectionHeading: currentHeadingPath[currentHeadingPath.length - 1],
          headingPath: [...currentHeadingPath],
        },
      });
    }
  }

  return {
    source,
    docType: 'docx',
    pageCount: 1,
    totalBlocks: blocks.length,
    timestamp,
    accessLevel,
    blocks,
  };
}

// Parses CSV buffer converting each row into a self-contained semantic entity with headers
// returns: ParsedDocument
function parseCsv(
  buffer: Buffer,
  source: string,
  timestamp: string,
  accessLevel: AccessLevel
): ParsedDocument {
  const rawText = buffer.toString('utf-8');
  const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      source,
      docType: 'csv',
      pageCount: 1,
      totalBlocks: 0,
      timestamp,
      accessLevel,
      blocks: [],
    };
  }

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const blocks: SemanticBlock[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowValues = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    if (rowValues.length !== headers.length) continue;

    // Preserves table columns alongside cell values for semantic embedding
    const semanticRow = headers.map((header, idx) => `${header}: ${rowValues[idx]}`).join(' | ');

    blocks.push({
      content: semanticRow,
      blockType: 'table',
      metadata: {
        source,
        page: 1,
        timestamp,
        docType: 'csv',
        accessLevel,
        sectionHeading: `Row ${i}`,
      },
    });
  }

  return {
    source,
    docType: 'csv',
    pageCount: 1,
    totalBlocks: blocks.length,
    timestamp,
    accessLevel,
    blocks,
  };
}

// Central entry point for parsing any supported document format
// returns: Promise<ParsedDocument> with validated metadata (source, page, timestamp, docType, accessLevel)
export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  accessLevel: AccessLevel = 'public_tenant'
): Promise<ParsedDocument> {
  const timestamp = new Date().toISOString();

  if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
    return await parsePdf(buffer, filename, timestamp, accessLevel);
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filename.endsWith('.docx')
  ) {
    return await parseDocx(buffer, filename, timestamp, accessLevel);
  }

  if (mimeType === 'text/csv' || filename.endsWith('.csv')) {
    return parseCsv(buffer, filename, timestamp, accessLevel);
  }

  // Fallback for plain text and markdown files
  const docType: DocType = filename.endsWith('.md') ? 'markdown' : 'txt';
  const textContent = buffer.toString('utf-8');
  const blocks = parseTextAndMarkdown(textContent, filename, docType, timestamp, accessLevel);

  return {
    source: filename,
    docType,
    pageCount: 1,
    totalBlocks: blocks.length,
    timestamp,
    accessLevel,
    blocks,
  };
}
