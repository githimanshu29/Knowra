// BullMQ distributed queue and worker interfaces
import { Queue, Worker, type Job } from 'bullmq';
// Redis connection client
import { Redis } from 'ioredis';
// Environment variables
import { env } from '../../config/env.js';
// Job processor function from worker
import { processIngestionJob, type IngestionJobResult } from './worker.js';

// Job payload interface
export interface IngestionQueuePayload {
  jobId: string;
  documentId?: string;
  tenantId?: string;
}

// Queue name constant
export const INGESTION_QUEUE_NAME = 'knowra-ingestion-queue';

let redisClient: Redis | null = null;
let ingestionQueue: Queue<IngestionQueuePayload> | null = null;
let ingestionWorker: Worker<IngestionQueuePayload, IngestionJobResult> | null = null;
let isRedisAvailable = false;

// Initializes or returns Redis connection instance
// returns: Redis | null
export function getRedisConnection(): Redis | null {
  if (redisClient) return redisClient;

  try {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) {
          // Cease retrying if Redis is not locally hosted
          return null;
        }
        return Math.min(times * 500, 2000);
      },
    });

    client.on('error', (err) => {
      isRedisAvailable = false;
      // Soft warning without crashing process
      if (err.message.includes('ECONNREFUSED')) {
        // Redis not listening locally; graceful in-memory queue fallback active
      }
    });

    client.on('connect', () => {
      isRedisAvailable = true;
    });

    redisClient = client;
    return client;
  } catch (err) {
    isRedisAvailable = false;
    return null;
  }
}

// Returns singleton instance of BullMQ Ingestion Queue
// returns: Queue<IngestionQueuePayload> | null
export function getIngestionQueue(): Queue<IngestionQueuePayload> | null {
  if (ingestionQueue) return ingestionQueue;

  const connection = getRedisConnection();
  if (!connection) return null;

  try {
    ingestionQueue = new Queue<IngestionQueuePayload>(INGESTION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
    return ingestionQueue;
  } catch (err) {
    return null;
  }
}

// Initializes distributed BullMQ background worker with concurrency ceiling
// returns: Worker<IngestionQueuePayload, IngestionJobResult> | null
export function initIngestionWorker(concurrency = 3): Worker<IngestionQueuePayload, IngestionJobResult> | null {
  if (ingestionWorker) return ingestionWorker;

  const connection = getRedisConnection();
  if (!connection) return null;

  try {
    ingestionWorker = new Worker<IngestionQueuePayload, IngestionJobResult>(
      INGESTION_QUEUE_NAME,
      async (job: Job<IngestionQueuePayload>) => {
        const { jobId } = job.data;
        const result = await processIngestionJob(jobId);
        return result;
      },
      {
        connection,
        concurrency,
        limiter: {
          max: 10,
          duration: 1000,
        },
      }
    );

    ingestionWorker.on('completed', (job) => {
      // Job completed successfully
    });

    ingestionWorker.on('failed', (job, err) => {
      console.warn(`Distributed job ${job?.id} failed attempt: ${err.message}`);
    });

    return ingestionWorker;
  } catch (err) {
    return null;
  }
}

// Enqueues an ingestion job to distributed queue or falls back to in-memory async execution
// returns: Promise<{ enqueued: boolean; queueMode: 'distributed' | 'in-memory'; jobId: string }>
export async function enqueueIngestionJob(
  jobId: string,
  metadata?: { documentId?: string; tenantId?: string }
): Promise<{ enqueued: boolean; queueMode: 'distributed' | 'in-memory'; jobId: string }> {
  const queue = getIngestionQueue();

  if (queue && isRedisAvailable) {
    try {
      await queue.add('process-document', {
        jobId,
        documentId: metadata?.documentId,
        tenantId: metadata?.tenantId,
      });

      return {
        enqueued: true,
        queueMode: 'distributed',
        jobId,
      };
    } catch (err) {
      // Fall through to in-memory fallback
    }
  }

  // Graceful in-memory fallback when Redis is absent
  processIngestionJob(jobId).catch((err) => {
    console.error(`In-memory ingestion job ${jobId} failed:`, err);
  });

  return {
    enqueued: true,
    queueMode: 'in-memory',
    jobId,
  };
}

// Returns real-time health metrics of the ingestion queue
// returns: Promise<{ isRedisAvailable: boolean; waiting: number; active: number; completed: number; failed: number }>
export async function getQueueMetrics(): Promise<{
  isRedisAvailable: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const queue = getIngestionQueue();

  if (!queue || !isRedisAvailable) {
    return {
      isRedisAvailable: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
    };
  }

  try {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return {
      isRedisAvailable: true,
      waiting,
      active,
      completed,
      failed,
    };
  } catch (err) {
    return {
      isRedisAvailable: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
    };
  }
}
