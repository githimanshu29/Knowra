// Node http server type for typed server instance
import { Server } from 'http';
// Express framework application factory
import express, { Request, Response } from 'express';
// Security headers middleware
import helmet from 'helmet';
// Cross origin resource sharing middleware
import cors from 'cors';
// Rate limiting middleware to prevent brute force and cost abuse
import rateLimit from 'express-rate-limit';
// Environment configuration
import { env } from './config/env.js';
// Graceful database pool shutdown helper
import { closeDatabaseConnection } from './db/index.js';
// Health check routes
import { healthRouter } from './routes/health.routes.js';
// Authentication and multi-tenant user routes
import { authRouter } from './routes/auth.routes.js';
// Document management and file upload routes
import { documentRouter } from './routes/document.routes.js';
// Chat intelligence and streaming SSE routes
import chatRouter from './routes/chat.routes.js';
// Centralized error handler middleware
import { errorHandler } from './middleware/errorHandler.js';
// Background stuck job recovery on startup
import { recoverStuckIngestionJobs } from './services/ingestion/worker.js';

export const app = express();

// Security HTTP headers
app.use(helmet());

// Origin-restricted CORS configuration
const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  })
);

// Standard payload parsing limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// General application rate limiter (200 requests per 15 minutes)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'API request limit exceeded. Try again later.' },
});

// Authentication rate limiter to prevent password brute force (20 attempts per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many authentication attempts. Try again later.' },
});

// Chat rate limiter to protect external LLM budget from abuse (60 queries per minute)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Chat rate limit reached. Please wait before querying again.' },
});

// Root route
// returns: void responds with 200 json metadata
app.get('/', (req: Request, res: Response): void => {
  res.json({
    name: 'Knowra Enterprise RAG API',
    version: '1.0.0',
    docs: '/api/v1',
    health: '/health',
  });
});

// Route Mounts with targeted rate limiters
app.use('/health', healthRouter);
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/documents', generalLimiter, documentRouter);
app.use('/api/v1/chat', chatLimiter, chatRouter);

// Centralized error handler
app.use(errorHandler);

// Starts the express http listener
// returns: http.Server instance
export function startServer(): Server {
  const server = app.listen(env.PORT, async () => {
    console.log(`Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
    console.log(`Health check ready at http://localhost:${env.PORT}/health`);

    // Recover any ingestion jobs stuck in PROCESSING state from previous server runs
    try {
      const recoveredCount = await recoverStuckIngestionJobs();
      if (recoveredCount > 0) {
        console.log(`Recovered ${recoveredCount} interrupted ingestion jobs.`);
      }
    } catch (err) {
      console.warn('Failed to recover interrupted ingestion jobs:', (err as Error).message);
    }
  });

  // Graceful shutdown handler for zero downtime
  const handleShutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log('HTTP server closed');
      await closeDatabaseConnection();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  return server;
}

// Auto-start server when run directly outside of test runners
if (!process.argv[1]?.includes('test') && !process.argv[1]?.includes('vitest')) {
  startServer();
}
