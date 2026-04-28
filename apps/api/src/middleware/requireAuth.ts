import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/jwt';

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

/**
 * Validates the Bearer access token in the Authorization header.
 * Attaches the decoded payload to req.user on success.
 * Returns 401 if missing/invalid, 403 if the token is valid but lacks the required role.
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
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired access token.' });
  }
}

/**
 * Middleware factory — requires the authenticated user to have one of the given roles.
 * Must be used after requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Insufficient permissions.' });
      return;
    }
    next();
  };
}
