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

// TypeScript Concept: MemoryStorage vs DiskStorage
// MemoryStorage keeps uploaded file in memory as req.file.buffer
// This allows computing sha256 checksum and mime validation before writing to disk
const storage = multer.memoryStorage();

// File filter validates mime type before accepting file
function fileFilter(req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, TXT, MD, CSV.`));
  }
}

// Configured multer middleware instance for single document upload
export const uploadSingleDocument = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter,
}).single('file');
