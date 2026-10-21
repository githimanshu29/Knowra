// Express router factory
import { Router } from 'express';
// Controller action handlers
import { getCurrentUser, login, registerTenant } from '../controllers/auth.controller.js';
// JWT verification middleware for protected routes
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();

// Public route: Registers new tenant organization and initial admin
authRouter.post('/register-tenant', registerTenant);

// Public route: Authenticates tenant member with email and password
authRouter.post('/login', login);

// Protected route: Returns current user context from verified JWT token
authRouter.get('/me', authenticate, getCurrentUser);
