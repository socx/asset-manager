import { prisma } from '@asset-manager/db';
import type { Prisma } from '@prisma/client';
import { logger } from './logger';

interface AuditEntry {
  actorId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  newValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
  oldValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Writes an entry to the audit_logs table.
 * Failures are logged but never propagate — audit logging must not abort a user-facing request.
 */
export async function createAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        newValue: entry.newValue,
        oldValue: entry.oldValue,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch (err) {
    logger.error('[audit] Failed to write audit log', { action: entry.action, err });
  }
}
