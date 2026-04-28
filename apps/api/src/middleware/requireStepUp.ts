import type { Response, NextFunction } from 'express';
import { redis } from '../lib/redis';
import type { AuthenticatedRequest } from './requireAuth';
import { STEP_UP_PREFIX } from '../routes/auth/stepUp';

/**
 * Middleware — requires the authenticated user to have completed step-up
 * authentication (re-entered password) within the last 30 minutes.
 * Must be used after requireAuth.
 */
export function requireStepUp(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.user?.sub;

  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  redis
    .get(`${STEP_UP_PREFIX}${userId}`)
    .then((val) => {
      if (!val) {
        res
          .status(403)
          .json({ message: 'Step-up authentication required.', code: 'STEP_UP_REQUIRED' });
        return;
      }
      next();
    })
    .catch(() => {
      res.status(500).json({ message: 'An unexpected error occurred.' });
    });
}
