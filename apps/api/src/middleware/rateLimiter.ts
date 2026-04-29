import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { RedisReply } from 'rate-limit-redis';
import { redis } from '../lib/redis';
import { env } from '../env';

// Rate limiting is disabled in the test environment to keep tests fast and deterministic.
const skip = () => env.NODE_ENV === 'test';

/**
 * Returns a RedisStore instance for the given key prefix.
 * Returns undefined in test mode so the default in-memory store is used,
 * avoiding unnecessary Redis connections in unit tests.
 */
function makeStore(prefix: string): RedisStore | undefined {
  if (env.NODE_ENV === 'test') return undefined;
  return new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<RedisReply>,
    prefix,
  });
}

/** 5 registration attempts per IP per hour */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 5,
  message: { message: 'Too many registration attempts from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:register:'),
  skip,
});

/** 3 resend-verification requests per email per hour (keyed by IP) */
export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 3,
  message: { message: 'Too many resend requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:resend:'),
  skip,
});

/** Generic auth limiter — 10 attempts per IP per 15 minutes (login, resend, etc.) */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 10,
  message: { message: 'Too many requests from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:auth:'),
  skip,
});

/** 3 forgot-password requests per IP per hour */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 3,
  message: { message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:forgot:'),
  skip,
});

/** 120 telemetry page-view events per session per minute (fire-and-forget nav tracking) */
export const telemetryLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 120,
  message: { message: 'Too many telemetry requests.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:telemetry:'),
  skip,
});
