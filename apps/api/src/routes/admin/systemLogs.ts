import type { Request, Response } from 'express';
import { prisma } from '@asset-manager/db';
import type { Prisma } from '@prisma/client';
import { logger } from '../../lib/logger';

/**
 * @openapi
 * /admin/system-logs:
 *   get:
 *     tags: [Admin · System Logs]
 *     summary: List system log entries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: level
 *         in: query
 *         schema:
 *           type: string
 *           enum: [debug, info, warn, error, fatal]
 *       - name: service
 *         in: query
 *         schema: { type: string }
 *       - name: traceId
 *         in: query
 *         schema: { type: string }
 *       - name: dateFrom
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - name: dateTo
 *         in: query
 *         schema: { type: string, format: date-time }
 *       - $ref: '#/components/parameters/CursorParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Paginated list of system log entries.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CursorPage'
 *                 - type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SystemLog'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */

// ── GET /api/v1/admin/system-logs ─────────────────────────────────────────────

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function listSystemLogsHandler(req: Request, res: Response): Promise<void> {
  const {
    level,
    service,
    traceId,
    dateFrom,
    dateTo,
    cursor,
    limit: limitStr,
  } = req.query as Record<string, string | undefined>;

  const limit = Math.min(parseInt(limitStr ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);

  const where: Prisma.SystemLogWhereInput = {};

  if (level) {
    if (!VALID_LEVELS.has(level)) {
      res.status(400).json({ message: `Invalid level. Must be one of: ${[...VALID_LEVELS].join(', ')}` });
      return;
    }
    where.level = level as 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  }

  if (service) where.service = service;
  if (traceId) where.traceId = traceId;

  if (dateFrom || dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) dateFilter.gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) dateFilter.lte = d;
    }
    if (Object.keys(dateFilter).length) where.createdAt = dateFilter;
  }

  if (cursor) {
    try {
      where.id = { lt: BigInt(cursor) };
    } catch {
      res.status(400).json({ message: 'Invalid cursor.' });
      return;
    }
  }

  try {
    const rows = await prisma.systemLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const nextCursor = hasMore ? rows[rows.length - 1].id.toString() : null;

    const logs = rows.map((row) => ({
      ...row,
      id: row.id.toString(),
    }));

    res.json({ logs, nextCursor });
  } catch (err) {
    logger.error('[systemLogs] Failed to list system logs', { err });
    res.status(500).json({ message: 'Failed to retrieve system logs.' });
  }
}
