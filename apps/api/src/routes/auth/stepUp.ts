import type { Response } from 'express';
import argon2 from 'argon2';
import { prisma } from '@asset-manager/db';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

export const STEP_UP_PREFIX = 'step_up:';
export const STEP_UP_TTL = 30 * 60; // 30 minutes in seconds

/**
 * POST /api/v1/auth/step-up
 * Re-authenticates the current user by verifying their password.
 * On success, grants a 30-minute step-up window stored in Redis.
 * Admin actions use requireStepUp middleware to verify this window.
 */
export async function stepUpHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.sub ?? '';
  const { password } = req.body as { password?: string };

  if (!password) {
    res.status(400).json({ message: 'Password is required.' });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, passwordHash: true, status: true },
  });

  if (!user || user.status !== 'active') {
    res.status(401).json({ message: 'Authentication failed.' });
    return;
  }

  const valid = await argon2.verify(user.passwordHash, password);

  if (!valid) {
    res.status(401).json({ message: 'Authentication failed.' });
    return;
  }

  await redis.set(`${STEP_UP_PREFIX}${userId}`, '1', 'EX', STEP_UP_TTL);
  logger.info('[step-up] Step-up authentication granted', { userId });

  res.json({ message: 'Step-up authentication successful.' });
}
