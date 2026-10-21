// Express error request handler type definition
import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
// Environment config to conditionally show stack traces in development
import { env } from '../config/env.js';

// TypeScript Concept: ErrorRequestHandler
// In express an error handler must have exactly 4 arguments (err, req, res, next)
// Typescript checks function arity so missing next would make express treat it as normal middleware
export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  console.error('Unhandled Application Error:', err);

  // returns: json object response with error message and optional debug details
  res.status(statusCode).json({
    error: err.name || 'Error',
    message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
