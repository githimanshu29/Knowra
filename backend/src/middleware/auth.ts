// Express request response and next function types
import { NextFunction, Request, Response } from 'express';
// Token verification helper and payload interface
import { AuthTokenPayload, verifyAccessToken } from '../utils/security.js';

// Declaration merging concept in TypeScript:
// In javascript req.user can be set dynamically but typescript throws a type error
// This block extends express Request interface globally so req.user is recognized by the compiler
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

// Express middleware that extracts and validates JWT from Authorization header
// returns: void calls next middleware if token is valid or returns 401/403 json response
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header with Bearer token',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid, forged, or expired access token',
    });
    return;
  }

  // Attach decoded user information directly to request object
  req.user = decoded;
  next();
}

// Middleware factory that requires user to have at least one of the specified roles
// returns: express middleware function
export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User context not found' });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions for this operation',
      });
      return;
    }

    next();
  };
}
