import type { Request, Response, NextFunction } from 'express';
import { Role } from '@asset-manager/types';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/jwt';
import { hasPermission, type Action } from '../lib/permissions';
import { redis } from '../lib/redis';

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

const ADMIN_ROLES: Set<string> = new Set(['super_admin', 'system_admin']);
const ACTIVE_SESSION_SET_ADMIN = 'active_sessions:admin';
const ACTIVE_SESSION_SET_APP   = 'active_sessions:app';
const SESSION_ACTIVITY_TTL_S   = 600; // 10 min — housekeeping window

/** Fire-and-forget: record that userId was seen now. */
function trackActiveSession(userId: string, role: string): void {
  try {
    const now = Date.now();
    const key = ADMIN_ROLES.has(role) ? ACTIVE_SESSION_SET_ADMIN : ACTIVE_SESSION_SET_APP;
    const cutoff = now - SESSION_ACTIVITY_TTL_S * 1000;
    redis.multi()
      .zremrangebyscore(key, '-inf', cutoff)
      .zadd(key, now, userId)
      .exec()
      .catch(() => { /* ignore redis errors */ });
  } catch {
    /* ignore if redis pipeline is unavailable */
  }
}

/**
 * Validates the Bearer access token in the Authorization header.
 * Attaches the decoded payload to req.user on success.
 * Returns 401 if missing/invalid token.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyAccessToken(token);
    trackActiveSession(req.user.sub, req.user.role);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired access token.' });
  }
}

/**
 * Middleware factory — requires the authenticated user to have one of the given roles.
 * Must be used after requireAuth.
 */
export function requireRole(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role as Role)) {
      res.status(403).json({ message: 'Insufficient permissions.' });
      return;
    }
    next();
  };
}

/**
 * Middleware factory — requires the authenticated user to have permission to perform
 * the given action. Must be used after requireAuth.
 */
export function requirePermission(action: Action) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !hasPermission(req.user.role, action)) {
      res.status(403).json({ message: 'Insufficient permissions.' });
      return;
    }
    next();
  };
}
