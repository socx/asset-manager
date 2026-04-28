import rateLimit from 'express-rate-limit';
import { env } from '../env';

// Rate limiting is disabled in the test environment to keep tests fast and deterministic.
const skip = () => env.NODE_ENV === 'test';

/** 5 registration attempts per IP per hour */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  max: 5,
  message: { message: 'Too many registration attempts from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});

/** Generic auth limiter — 10 attempts per IP per 15 minutes (login, resend, etc.) */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 10,
  message: { message: 'Too many requests from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip,
});
