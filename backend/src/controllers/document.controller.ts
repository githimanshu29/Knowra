// Express http types
import { NextFunction, Request, Response } from 'express';
// Drizzle query operators
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
// Node filesystem promises for file deletion
import fs from 'fs/promises';
// Database client instance
import { db } from '../db/index.js';
// Drizzle schemas
import { documentPermissions, documentVersions, documents, ingestionJobs, roles, users } from '../db/schema/index.js';
// Zod document input validation schemas
import { addDocumentPermissionSchema, updateDocumentAccessSchema } from '../schemas/document.schema.js';
// File storage helpers
import { computeFileHash, saveFile } from '../services/storage.service.js';
// Background ingestion worker trigger
import { triggerIngestionWorker } from '../services/ingestion/worker.js';
// Upload magic bytes validator
import { validateFileMagicBytes } from '../middleware/upload.js';

// Helper to verify if a user has read permission on a document
// returns: Promise<boolean>
async function userHasDocumentAccess(
  documentId: string,
  userId: string,
  roleIds: string[],
  isSuperAdmin: boolean
): Promise<boolean> {
  if (isSuperAdmin) return true;

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
  });

  if (!doc) return false;
  if (doc.isPublicWithinTenant) return true;
  if (doc.createdBy === userId) return true;

  // Check document permissions table
  const permissions = await db.query.documentPermissions.findMany({
    where: eq(documentPermissions.documentId, documentId),
  });

  return permissions.some(
    (p) =>
      p.userId === userId ||
      (p.roleId && roleIds.includes(p.roleId))
  );
}

// Handles multipart document upload, magic bytes validation, sha256 deduplication, and ingestion queuing
// returns: Promise<void> responds with 201 json { documentId: string, jobId: string, status: string }
export async function uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Bad Request', message: 'No file uploaded' });
      return;
    }

    // Magic bytes verification
    const isValidMagic = validateFileMagicBytes(req.file.buffer, req.file.mimetype);
    if (!isValidMagic) {
      res.status(400).json({
        error: 'Bad Request',
        message: `File binary signature does not match declared MIME type: ${req.file.mimetype}`,
      });
      return;
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const roleIds = req.user!.roleIds || [];
    const isSuperAdmin = Boolean(req.user!.isSuperAdmin);
    const contentHash = computeFileHash(req.file.buffer);

    // Check for existing document with identical content hash within tenant
    const existingDoc = await db.query.documents.findFirst({
      where: and(eq(documents.tenantId, tenantId), eq(documents.contentHash, contentHash)),
    });

    if (existingDoc) {
      const canAccessExisting = await userHasDocumentAccess(
        existingDoc.id,
        userId,
        roleIds,
        isSuperAdmin
      );

      // Only expose deduplication shortcut if user has legitimate read access to the existing document
      if (canAccessExisting) {
        res.status(200).json({
          message: 'Duplicate document: file already uploaded with identical content hash',
          documentId: existingDoc.id,
          filename: existingDoc.filename,
          status: existingDoc.status,
        });
        return;
      }
    }

    const storagePath = await saveFile(tenantId, req.file.originalname, req.file.buffer);

    // Database transaction to create document, version 1, and initial ingestion job atomically
    const result = await db.transaction(async (tx) => {
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
          isPublicWithinTenant: req.body.isPublicWithinTenant === 'true' || req.body.isPublicWithinTenant === true,
          status: 'QUEUED',
        })
        .returning();

      const [initialVersion] = await tx
        .insert(documentVersions)
        .values({
          documentId: newDoc.id,
          versionNumber: 1,
          contentHash,
        })
        .returning();

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
        isPublicWithinTenant: newDoc.isPublicWithinTenant,
        status: newDoc.status,
      };
    });

    // Triggers background ingestion pipeline asynchronously
    triggerIngestionWorker(result.jobId);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// Lists all documents accessible to the authenticated user within their tenant
// returns: Promise<void> responds with 200 json { documents: Array<Document> }
export async function listDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const roleIds = req.user!.roleIds || [];
    const isSuperAdmin = Boolean(req.user!.isSuperAdmin);

    let docsList;

    if (isSuperAdmin) {
      // Admins can see all documents within their tenant
      docsList = await db.query.documents.findMany({
        where: eq(documents.tenantId, tenantId),
        orderBy: [desc(documents.createdAt)],
      });
    } else {
      // Non-admins only see public documents, documents they created, or documents explicitly shared with them or their roles
      const accessiblePerms = await db.query.documentPermissions.findMany({
        where: or(
          eq(documentPermissions.userId, userId),
          roleIds.length > 0 ? inArray(documentPermissions.roleId, roleIds) : sql`1=0`
        ),
      });

      const permittedDocIds = accessiblePerms.map((p) => p.documentId);

      docsList = await db.query.documents.findMany({
        where: and(
          eq(documents.tenantId, tenantId),
          or(
            eq(documents.isPublicWithinTenant, true),
            eq(documents.createdBy, userId),
            permittedDocIds.length > 0 ? inArray(documents.id, permittedDocIds) : sql`1=0`
          )
        ),
        orderBy: [desc(documents.createdAt)],
      });
    }

    // Strip sensitive internal storagePath before returning to client
    const sanitizedDocs = docsList.map((doc) => {
      const { storagePath, ...safeFields } = doc;
      return safeFields;
    });

    res.status(200).json({
      documents: sanitizedDocs,
      totalCount: sanitizedDocs.length,
    });
  } catch (error) {
    next(error);
  }
}

// Retrieves single document metadata with versions, permissions, and ingestion status if authorized
// returns: Promise<void> responds with 200 json { document: object } or 404
export async function getDocumentDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const roleIds = req.user!.roleIds || [];
    const isSuperAdmin = Boolean(req.user!.isSuperAdmin);
    const documentId = req.params.id as string;

    const docDetails = await db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
      with: {
        versions: true,
        permissions: {
          with: {
            role: true,
            user: true,
          },
        },
        ingestionJobs: true,
      },
    });

    if (!docDetails) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found' });
      return;
    }

    // Authorization check
    const hasAccess = await userHasDocumentAccess(documentId, userId, roleIds, isSuperAdmin);
    if (!hasAccess) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found' });
      return;
    }

    // Strip storagePath
    const { storagePath, ...safeDoc } = docDetails;

    res.status(200).json({ document: safeDoc });
  } catch (error) {
    next(error);
  }
}

// Updates document tenant visibility (public vs private)
// returns: Promise<void> responds with 200 json { document: object }
export async function updateDocumentAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const isSuperAdmin = Boolean(req.user!.isSuperAdmin);
    const documentId = req.params.id as string;

    const parseResult = updateDocumentAccessSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const { isPublicWithinTenant } = parseResult.data;

    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
    });

    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found' });
      return;
    }

    if (!isSuperAdmin && doc.createdBy !== userId) {
      res.status(403).json({ error: 'Forbidden', message: 'Only document creator or admin can update access' });
      return;
    }

    const [updatedDoc] = await db
      .update(documents)
      .set({ isPublicWithinTenant, updatedAt: new Date() })
      .where(eq(documents.id, documentId))
      .returning();

    const { storagePath, ...safeDoc } = updatedDoc;
    res.status(200).json({ document: safeDoc });
  } catch (error) {
    next(error);
  }
}

// Grants read or write permission for a document to a specific role or user
// returns: Promise<void> responds with 201 json { permission: object }
export async function addDocumentPermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const currentUserId = req.user!.userId;
    const isSuperAdmin = Boolean(req.user!.isSuperAdmin);
    const documentId = req.params.id as string;

    const parseResult = addDocumentPermissionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const { roleId, userId, permissionLevel } = parseResult.data;

    // Cross-tenant permission poisoning defense: verify target role belongs to same tenant
    if (roleId) {
      const roleRecord = await db.query.roles.findFirst({
        where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
      });
      if (!roleRecord) {
        res.status(400).json({ error: 'Bad Request', message: 'Target role does not belong to your tenant' });
        return;
      }
    }

    // Cross-tenant permission poisoning defense: verify target user belongs to same tenant
    if (userId) {
      const userRecord = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.tenantId, tenantId)),
      });
      if (!userRecord) {
        res.status(400).json({ error: 'Bad Request', message: 'Target user does not belong to your tenant' });
        return;
      }
    }

    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
    });

    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found' });
      return;
    }

    if (!isSuperAdmin && doc.createdBy !== currentUserId) {
      res.status(403).json({ error: 'Forbidden', message: 'Only document creator or admin can grant permissions' });
      return;
    }

    const [newPermission] = await db
      .insert(documentPermissions)
      .values({
        documentId,
        roleId: roleId || null,
        userId: userId || null,
        permissionLevel,
      })
      .returning();

    res.status(201).json({ permission: newPermission });
  } catch (error) {
    next(error);
  }
}

// Revokes an existing document permission
// returns: Promise<void> responds with 200 json { success: boolean }
export async function removeDocumentPermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const currentUserId = req.user!.userId;
    const isSuperAdmin = Boolean(req.user!.isSuperAdmin);
    const documentId = req.params.id as string;
    const permissionId = req.params.permissionId as string;

    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
    });

    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found' });
      return;
    }

    if (!isSuperAdmin && doc.createdBy !== currentUserId) {
      res.status(403).json({ error: 'Forbidden', message: 'Only document creator or admin can revoke permissions' });
      return;
    }

    await db
      .delete(documentPermissions)
      .where(and(eq(documentPermissions.id, permissionId), eq(documentPermissions.documentId, documentId)));

    res.status(200).json({ success: true, message: 'Permission revoked successfully' });
  } catch (error) {
    next(error);
  }
}

// Deletes a document, its database records, and its physical file from storage
// returns: Promise<void> responds with 200 json { success: boolean }
export async function deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const currentUserId = req.user!.userId;
    const isSuperAdmin = Boolean(req.user!.isSuperAdmin);
    const documentId = req.params.id as string;

    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)),
    });

    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found' });
      return;
    }

    if (!isSuperAdmin && doc.createdBy !== currentUserId) {
      res.status(403).json({ error: 'Forbidden', message: 'Only document creator or admin can delete document' });
      return;
    }

    // Delete physical file from storage if it exists
    if (doc.storagePath) {
      try {
        await fs.unlink(doc.storagePath);
      } catch {
        // File may have already been removed or missing from disk
      }
    }

    // Cascade deletes in database
    await db.delete(documents).where(eq(documents.id, documentId));

    res.status(200).json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    next(error);
  }
}
