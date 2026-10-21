// Express router factory
import { Router } from 'express';
// Controller action handlers
import { getDocumentDetails, listDocuments, uploadDocument } from '../controllers/document.controller.js';
// JWT verification middleware to authenticate requests and enforce tenant boundaries
import { authenticate } from '../middleware/auth.js';
// Multer middleware for parsing and filtering single document file uploads
import { uploadSingleDocument } from '../middleware/upload.js';

export const documentRouter = Router();

// Upload document endpoint (protected by JWT, parses multipart/form-data)
documentRouter.post('/upload', authenticate, uploadSingleDocument, uploadDocument);

// List all documents belonging to authenticated tenant
documentRouter.get('/', authenticate, listDocuments);

// Retrieve single document details and processing status by ID
documentRouter.get('/:id', authenticate, getDocumentDetails);
