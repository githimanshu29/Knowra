// Multer middleware for handling multipart form data file uploads
import multer, { FileFilterCallback } from 'multer';
// Express request type
import { Request } from 'express';

// Permitted MIME types for enterprise knowledge documents
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
];

// Maximum allowed upload file size: 50 Megabytes
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

// TypeScript Concept: MemoryStorage
// Keeps uploaded file in memory as req.file.buffer for hash verification and magic byte checks
const storage = multer.memoryStorage();

// Validates claimed MIME type against enterprise whitelist
// returns: void
function fileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, TXT, MD, CSV.`));
  }
}

// Verifies binary magic bytes match the claimed file type to prevent extension spoofing
// returns: boolean true if magic bytes match file specification
export function validateFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  // PDF signature: %PDF (0x25 0x50 0x44 0x46)
  if (mimeType === 'application/pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  // DOCX signature: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }

  // Text, Markdown, CSV: check for absence of null bytes in header to detect masquerading binary
  if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
    const checkLength = Math.min(buffer.length, 1024);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0x00) {
        return false;
      }
    }
    return true;
  }

  return false;
}

// Configured multer instance for single document upload
export const uploadSingleDocument = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter,
}).single('file');
