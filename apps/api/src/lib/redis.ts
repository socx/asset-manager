import Redis from 'ioredis';
import { env } from '../env';

// Shared ioredis instance — used by BullMQ queues in the API process.
// The worker creates its own connection; this is API-only.
export const redis = new Redis(env.REDIS_URL, {
  // Required by BullMQ
  maxRetriesPerRequest: null,
  // Don't connect until first command — avoids crashing API if Redis is temporarily unavailable at startup
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  // Log but don't crash — Redis downtime should not bring down the API
  console.error('[redis] Connection error:', err.message);
});
