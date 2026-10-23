// Express Router helper
import { Router } from 'express';
// Authentication middleware for tenant and user context verification
import { authenticate } from '../middleware/auth.js';
// Chat query controller handler
import { chatQueryHandler } from '../controllers/chat.controller.js';

// Express router instance for chat intelligence endpoints
const router = Router();

// Route: Standard or streaming chat query
// POST /api/v1/chat/query
router.post('/query', authenticate, chatQueryHandler);

// Route: Dedicated streaming chat query endpoint
// POST /api/v1/chat/stream
router.post('/stream', authenticate, (req, res) => {
  req.body = { ...req.body, stream: true };
  return chatQueryHandler(req, res);
});

// Default export of configured router
export default router;
