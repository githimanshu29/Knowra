// Node http server type for typed server instance
import { Server } from 'http';
// Express framework application factory
import express, { Request, Response } from 'express';
// Cross origin resource sharing middleware
import cors from 'cors';
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
// Centralized error handler middleware
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Root route
// returns: json object with api metadata
app.get('/', (req: Request, res: Response): void => {
  res.json({
    name: 'Knowra Enterprise RAG API',
    version: '1.0.0',
    docs: '/api/v1',
    health: '/health',
  });
});

// Route Mounts
app.use('/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/documents', documentRouter);

// Centralized error handler must be registered after all route handlers
app.use(errorHandler);

// Starts the express http listener
// returns: http.Server instance
export function startServer(): Server {
  const server = app.listen(env.PORT, () => {
    console.log(`Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
    console.log(`Health check ready at http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown handler for zero downtime and connection cleanup
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

// Auto-start server when run directly
startServer();
