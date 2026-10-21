// Node filesystem promises for non-blocking disk io
import fs from 'fs/promises';
// Node path utilities for cross-platform file path resolution
import path from 'path';
// Node crypto module for computing sha256 checksums
import crypto from 'crypto';

// Base directory for storing uploaded files locally
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

// TypeScript Concept: Buffer
// In nodejs Buffer represents raw binary data in memory outside the v8 heap
// It is used to read and manipulate binary files like pdfs and images

// Computes sha256 checksum hash from file binary buffer
// returns: string 64 character hex hash
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Saves uploaded buffer to tenant-isolated disk folder
// returns: Promise<string> relative filesystem storage path
export async function saveFile(tenantId: string, filename: string, buffer: Buffer): Promise<string> {
  const tenantDir = path.join(UPLOADS_ROOT, tenantId);
  await fs.mkdir(tenantDir, { recursive: true });

  const safeFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const targetPath = path.join(tenantDir, safeFilename);

  await fs.writeFile(targetPath, buffer);
  return path.relative(process.cwd(), targetPath);
}

// Reads raw binary buffer from disk storage path
// returns: Promise<Buffer> file binary buffer
export async function readFile(storagePath: string): Promise<Buffer> {
  const fullPath = path.resolve(process.cwd(), storagePath);
  return await fs.readFile(fullPath);
}

// Deletes file from storage path
// returns: Promise<void>
export async function deleteFile(storagePath: string): Promise<void> {
  try {
    const fullPath = path.resolve(process.cwd(), storagePath);
    await fs.unlink(fullPath);
  } catch (error) {
    console.error('File deletion error:', (error as Error).message);
  }
}
