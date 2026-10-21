// Express http types
import { NextFunction, Request, Response } from 'express';
// Drizzle query operators
import { and, desc, eq } from 'drizzle-orm';
// Database client instance
import { db } from '../db/index.js';
// Drizzle schemas
import { documentVersions, documents, ingestionJobs } from '../db/schema/index.js';
// File storage helpers
import { computeFileHash, saveFile } from '../services/storage.service.js';
// Background ingestion worker trigger
import { triggerIngestionWorker } from '../services/ingestion/worker.js';

// Handles multipart document upload, sha256 duplicate detection, and queuing
// returns: Promise<void> responds with 201 json { documentId: string, jobId: string, status: string }
export async function uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Bad Request', message: 'No file uploaded' });
      return;
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const contentHash = computeFileHash(req.file.buffer);

    // existingDoc is a single object { id: string, title: string, status: string } or undefined
    const existingDoc = await db.query.documents.findFirst({
      where: and(eq(documents.tenantId, tenantId), eq(documents.contentHash, contentHash)),
    });

    if (existingDoc) {
      res.status(200).json({
        message: 'Duplicate document: file already uploaded with identical content hash',
        documentId: existingDoc.id,
        filename: existingDoc.filename,
        status: existingDoc.status,
      });
      return;
    }

    const storagePath = await saveFile(tenantId, req.file.originalname, req.file.buffer);

    // Database transaction to create document, version 1, and initial ingestion job atomically
    const result = await db.transaction(async (tx) => {
      // newDoc is a single object { id: string, tenantId: string, title: string, status: string, ... }
      const [newDoc] = await tx
        .insert(documents)
        .values({
          tenantId,
          createdBy: userId,
          title: req.body.title || req.file!.originalname,
          filename: req.file!.originalname,
          mimeType: req.file!.mimetype,
          fileSizeBytes: req.file!.size,
          contentHash,
          storagePath,
          status: 'QUEUED',
        })
        .returning();

      // initialVersion is a single object { id: string, documentId: string, versionNumber: 1, ... }
      const [initialVersion] = await tx
        .insert(documentVersions)
        .values({
          documentId: newDoc.id,
          versionNumber: 1,
          contentHash,
        })
        .returning();

      // job is a single object { id: string, tenantId: string, documentId: string, status: 'QUEUED', ... }
      const [job] = await tx
        .insert(ingestionJobs)
        .values({
          tenantId,
          documentId: newDoc.id,
          status: 'QUEUED',
          progressPercent: 0,
        })
        .returning();

      return {
        documentId: newDoc.id,
        versionId: initialVersion.id,
        jobId: job.id,
        filename: newDoc.filename,
        fileSizeBytes: newDoc.fileSizeBytes,
        status: newDoc.status,
      };
    });

    // Triggers background ingestion pipeline without blocking client response
    triggerIngestionWorker(result.jobId);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// Lists all documents belonging to authenticated tenant
// returns: Promise<void> responds with 200 json { documents: Array<Document> }
export async function listDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;

    // docsList is an Array of Objects: [{ id: string, title: string, filename: string, status: string, ... }]
    const docsList = await db.query.documents.findMany({
      where: eq(documents.tenantId, tenantId),
      orderBy: [desc(documents.createdAt)],
    });

    res.status(200).json({
      documents: docsList,
      totalCount: docsList.length,
    });
  } catch (error) {
    next(error);
  }
}

// Retrieves single document metadata with versions and ingestion jobs
// returns: Promise<void> responds with 200 json { document: object } or 404
export async function getDocumentDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const documentId = req.params.id as string;

    // docDetails is a single object with nested versions and ingestionJobs arrays or undefined
    const docDetails = await db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
      with: {
        versions: true,
        ingestionJobs: true,
      },
    });

    if (!docDetails) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found' });
      return;
    }

    res.status(200).json({ document: docDetails });
  } catch (error) {
    next(error);
  }
}
