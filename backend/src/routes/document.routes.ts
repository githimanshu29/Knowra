// Express router factory
import { Router } from 'express';
// Controller action handlers
import {
  addDocumentPermission,
  deleteDocument,
  getDocumentDetails,
  listDocuments,
  removeDocumentPermission,
  updateDocumentAccess,
  uploadDocument,
} from '../controllers/document.controller.js';
// JWT verification middleware to authenticate requests and enforce tenant boundaries
import { authenticate } from '../middleware/auth.js';
// Multer middleware for parsing and filtering single document file uploads
import { uploadSingleDocument } from '../middleware/upload.js';

export const documentRouter = Router();

// Upload document endpoint (protected by JWT, parses multipart/form-data)
documentRouter.post('/upload', authenticate, uploadSingleDocument, uploadDocument);

// List all documents accessible to the authenticated user within their tenant
documentRouter.get('/', authenticate, listDocuments);

// Retrieve single document details and processing status by ID
documentRouter.get('/:id', authenticate, getDocumentDetails);

// Update document tenant visibility (public within tenant vs private)
documentRouter.patch('/:id/access', authenticate, updateDocumentAccess);

// Grant document access permission to a user or role
documentRouter.post('/:id/permissions', authenticate, addDocumentPermission);

// Revoke a specific document permission
documentRouter.delete('/:id/permissions/:permissionId', authenticate, removeDocumentPermission);

// Delete document and all associated chunks and versions
documentRouter.delete('/:id', authenticate, deleteDocument);
