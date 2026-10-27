// Express Router helper
import { Router } from 'express';
// Authentication middleware for tenant and user context verification
import { authenticate } from '../middleware/auth.js';
// Chat query and conversation controller handlers
import {
  chatQueryHandler,
  createConversationHandler,
  getConversationDetailsHandler,
  listConversationsHandler,
} from '../controllers/chat.controller.js';

// Express router instance for chat intelligence endpoints
const router = Router();

// Route: Standard or streaming chat query
router.post('/query', authenticate, chatQueryHandler);

// Route: Dedicated streaming chat query endpoint
router.post('/stream', authenticate, (req, res) => {
  req.body = { ...req.body, stream: true };
  return chatQueryHandler(req, res);
});

// Route: Create new multi-turn conversation
router.post('/conversations', authenticate, createConversationHandler);

// Route: List conversations for authenticated user
router.get('/conversations', authenticate, listConversationsHandler);

// Route: Get conversation details and chronological messages
router.get('/conversations/:id', authenticate, getConversationDetailsHandler);

// Default export of configured router
export default router;
