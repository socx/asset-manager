import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { runWithTraceId } from '../lib/traceContext';

export function traceIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = randomUUID();
  res.setHeader('X-Trace-Id', traceId);
  runWithTraceId(traceId, () => next());
}
