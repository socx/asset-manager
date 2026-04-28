import type { Request, Response } from 'express';
import { prisma } from '@asset-manager/db';
import type { Prisma } from '@prisma/client';
import { logger } from '../../lib/logger';

// ── GET /api/v1/admin/audit-logs ──────────────────────────────────────────────

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function listAuditLogsHandler(req: Request, res: Response): Promise<void> {
  const {
    actorId,
    action,
    entityType,
    entityId,
    dateFrom,
    dateTo,
    cursor,
    limit: limitStr,
  } = req.query as Record<string, string | undefined>;

  const limit = Math.min(parseInt(limitStr ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);

  const where: Prisma.AuditLogWhereInput = {};

  if (actorId) where.actorId = actorId;
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;

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

  // Cursor: id of the last item in the previous page (exclusive, going backwards in time)
  if (cursor) {
    try {
      where.id = { lt: BigInt(cursor) };
    } catch {
      res.status(400).json({ message: 'Invalid cursor.' });
      return;
    }
  }

  try {
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const nextCursor = hasMore ? rows[rows.length - 1].id.toString() : null;

    // Serialize BigInt ids to string for JSON
    const logs = rows.map((row) => ({
      ...row,
      id: row.id.toString(),
    }));

    res.json({ logs, nextCursor });
  } catch (err) {
    logger.error('[auditLogs] Failed to list audit logs', { err });
    res.status(500).json({ message: 'Failed to retrieve audit logs.' });
  }
}
