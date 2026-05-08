import type { Request, Response } from 'express';
import { logger } from '../../lib/logger';

/**
 * Simple debug endpoint for emitting a test error which should be persisted
 * to `system_logs` (warn/error/fatal only).
 */
export function emitTestSystemLogHandler(_req: Request, res: Response): void {
  logger.error('[debug] test system log emitted via /admin/system-logs/test', { test: true });
  res.status(204).send();
}
