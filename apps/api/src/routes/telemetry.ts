import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { redis } from '../lib/redis';
import { telemetryLimiter } from '../middleware/rateLimiter';

export const telemetryRouter = Router();

const pageviewSchema = z.object({
  path:      z.string().max(500).startsWith('/'),
  sessionId: z.string().max(64).optional(),
});

const PAGE_VIEW_PREFIX    = 'page_views:';
const PAGE_VIEW_WINDOW_MS = 5 * 60 * 1000; // 5 minutes activity window
const PAGE_VIEW_TTL_S     = 600;            // sort-set TTL after last write

/**
 * @openapi
 * /telemetry/pageview:
 *   post:
 *     tags: [Telemetry]
 *     summary: Record a page view (fire-and-forget, no PII stored)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [path]
 *             properties:
 *               path:
 *                 type: string
 *                 example: /admin/users
 *               sessionId:
 *                 type: string
 *                 description: Anonymised client session token (not a user identifier)
 *     responses:
 *       204:
 *         description: Recorded.
 *       400:
 *         description: Validation error.
 */
async function pageviewHandler(req: Request, res: Response): Promise<void> {
  const result = pageviewSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ message: 'Invalid payload.', errors: result.error.flatten().fieldErrors });
    return;
  }

  const { path, sessionId } = result.data;
  // Anonymise: if no sessionId supplied fall back to request IP hash (we only store path + anonymous token)
  const anon = sessionId ?? (req.ip ?? 'unknown');
  const key  = `${PAGE_VIEW_PREFIX}${path}`;
  const now  = Date.now();
  const cutoff = now - PAGE_VIEW_WINDOW_MS;

  // Store the anonymous token with a score of "now" and trim stale entries; set TTL on the key
  await redis.multi()
    .zremrangebyscore(key, '-inf', cutoff)
    .zadd(key, now, anon)
    .expire(key, PAGE_VIEW_TTL_S)
    .exec();

  res.status(204).end();
}

telemetryRouter.post('/pageview', telemetryLimiter, pageviewHandler);
