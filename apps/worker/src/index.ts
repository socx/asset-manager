import { Worker } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

const connection = new Redis(redisUrl, {
  // Required by BullMQ — disables auto-blocking retries
  maxRetriesPerRequest: null,
});

// Email job worker — processes verification emails, password resets, notifications
const emailWorker = new Worker(
  'email',
  async (job) => {
    console.log(`[worker] Processing email job "${job.name}" (id: ${job.id})`);
    // Email processing logic will be implemented in ITER-1-006
    // (email verification) and subsequent stories.
  },
  { connection },
);

emailWorker.on('completed', (job) => {
  console.log(`[worker] Email job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[worker] Email job ${job?.id} failed:`, err.message);
});

console.log('[worker] Started — listening for jobs on Redis queue "email"');

const shutdown = (signal: string) => {
  console.log(`[worker] ${signal} received — shutting down gracefully`);
  emailWorker.close().then(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
