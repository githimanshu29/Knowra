// Express error request handler type definition
import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
// Environment config to conditionally show stack traces in development
import { env } from '../config/env.js';

// Zod error class for runtime schema validation errors
import { ZodError } from 'zod';

// TypeScript Concept: ErrorRequestHandler
// In express an error handler must have exactly 4 arguments (err, req, res, next)
// Typescript checks function arity so missing next would make express treat it as normal middleware
export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Handle Zod schema validation errors cleanly with status 400
  if (err instanceof ZodError || err.name === 'ZodError') {
    const formattedMessage = err.issues
      ? err.issues.map((i: any) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`).join(', ')
      : 'Validation failed for request payload';

    res.status(400).json({
      error: 'Validation Error',
      message: formattedMessage,
      details: err.issues,
    });
    return;
  }

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
