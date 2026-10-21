// Express router factory and http types
import { Request, Response, Router } from 'express';
// Database connectivity health checker function
import { checkDatabaseConnection } from '../db/index.js';
// Validated environment variables
import { env } from '../config/env.js';

export const healthRouter = Router();

// GET /health
// returns: json object { status: string, timestamp: string, database: boolean, uptime: number }
healthRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  // isDbConnected is a boolean: true if postgres responds to SELECT 1 or false if down
  const isDbConnected = await checkDatabaseConnection();

  const responsePayload = {
    status: isDbConnected ? 'healthy' : 'degraded',
    service: 'knowra-backend',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    database: isDbConnected,
    uptimeSeconds: Math.floor(process.uptime()),
  };

  const httpStatus = isDbConnected ? 200 : 503;
  res.status(httpStatus).json(responsePayload);
});
