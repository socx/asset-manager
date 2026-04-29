import type { Request, Response } from 'express';
import { prisma } from '@asset-manager/db';
import { redis } from '../../lib/redis';

const ADMIN_SET = 'active_sessions:admin';
const APP_SET   = 'active_sessions:app';
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ── Active-users handler (ITER-2-007) ─────────────────────────────────────────

/**
 * @openapi
 * /admin/dashboard/active-users:
 *   get:
 *     tags: [Admin]
 *     summary: Return live active-user counts and 24-hour activity chart
 *     security:
 *       - bearerAuth: []
 */
export async function activeUsersHandler(_req: Request, res: Response): Promise<void> {
  const now = Date.now();
  const cutoff = now - ACTIVE_WINDOW_MS;

  const [adminCount, appCount] = await Promise.all([
    redis.zcount(ADMIN_SET, cutoff, '+inf'),
    redis.zcount(APP_SET,   cutoff, '+inf'),
  ]);

  // 24-hour hourly activity (new sessions created per hour as a proxy for activity)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const sessions = await prisma.userSession.findMany({
    where: {
      createdAt: { gte: since24h },
      revokedAt: null,
    },
    select: { createdAt: true },
  });

  // Build 24 hourly buckets (0 = 23 hours ago, 23 = current hour)
  const hourlyMap = new Map<number, number>();
  for (let i = 0; i < 24; i++) hourlyMap.set(i, 0);

  for (const s of sessions) {
    const hourIndex = Math.floor((now - s.createdAt.getTime()) / (60 * 60 * 1000));
    if (hourIndex >= 0 && hourIndex < 24) {
      const bucket = 23 - hourIndex;
      hourlyMap.set(bucket, (hourlyMap.get(bucket) ?? 0) + 1);
    }
  }

  const hourlyActivity = Array.from({ length: 24 }, (_, i) => {
    const hoursAgo = now - (23 - i) * 60 * 60 * 1000;
    const label = new Date(hoursAgo).toISOString().slice(11, 16); // HH:mm
    return { hour: label, sessions: hourlyMap.get(i) ?? 0 };
  });

  res.json({
    adminOnline: adminCount,
    appOnline:   appCount,
    totalOnline: adminCount + appCount,
    hourlyActivity,
    updatedAt: new Date().toISOString(),
  });
}

// ── Page-activity handler (ITER-2-008) ────────────────────────────────────────

/**
 * @openapi
 * /admin/dashboard/page-activity:
 *   get:
 *     tags: [Admin]
 *     summary: Return top 5 pages by active sessions in the last 5 minutes
 *     security:
 *       - bearerAuth: []
 */
export async function pageActivityHandler(_req: Request, res: Response): Promise<void> {
  const now = Date.now();
  const cutoff = now - ACTIVE_WINDOW_MS;

  // Scan all page_views:* keys
  let cursor = '0';
  const pathCounts: { path: string; activeUsers: number }[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'page_views:*', 'COUNT', 100);
    cursor = nextCursor;

    if (keys.length > 0) {
      await Promise.all(
        keys.map(async (key) => {
          const count = await redis.zcount(key, cutoff, '+inf');
          if (count > 0) {
            const path = key.slice('page_views:'.length);
            pathCounts.push({ path, activeUsers: count });
          }
        }),
      );
    }
  } while (cursor !== '0');

  pathCounts.sort((a, b) => b.activeUsers - a.activeUsers);

  res.json({
    pages: pathCounts.slice(0, 5),
    updatedAt: new Date().toISOString(),
  });
}

// ── Health handler (ITER-2-009) ───────────────────────────────────────────────

const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
const WORKER_MAX_AGE_MS    = 90_000; // 90 seconds

/**
 * @openapi
 * /admin/dashboard/health:
 *   get:
 *     tags: [Admin]
 *     summary: Return service health status for API, DB, and worker
 *     security:
 *       - bearerAuth: []
 */
export async function healthHandler(_req: Request, res: Response): Promise<void> {
  // API health — if we're responding, we're healthy
  const api = { status: 'healthy' as const, checkedAt: new Date().toISOString() };

  // DB health
  let db: { status: 'healthy' | 'degraded' | 'offline'; latencyMs: number; checkedAt: string };
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    db = { status: 'healthy', latencyMs: Date.now() - dbStart, checkedAt: new Date().toISOString() };
  } catch {
    db = { status: 'offline', latencyMs: -1, checkedAt: new Date().toISOString() };
  }

  // Worker health — check Redis heartbeat key
  let worker: { status: 'healthy' | 'degraded' | 'offline'; checkedAt: string };
  try {
    const heartbeat = await redis.get(WORKER_HEARTBEAT_KEY);
    if (!heartbeat) {
      worker = { status: 'offline', checkedAt: new Date().toISOString() };
    } else {
      const age = Date.now() - Number(heartbeat);
      worker = {
        status: age <= WORKER_MAX_AGE_MS ? 'healthy' : 'offline',
        checkedAt: new Date().toISOString(),
      };
    }
  } catch {
    worker = { status: 'offline', checkedAt: new Date().toISOString() };
  }

  res.json({ api, db, worker });
}
