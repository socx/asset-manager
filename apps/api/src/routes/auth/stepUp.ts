import type { Response } from 'express';
import argon2 from 'argon2';
import { prisma } from '@asset-manager/db';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

export const STEP_UP_PREFIX = 'step_up:';
export const STEP_UP_TTL = 30 * 60; // 30 minutes in seconds

/**
 * @openapi
 * /auth/step-up:
 *   post:
 *     tags: [Auth]
 *     summary: Re-authenticate for admin actions (step-up)
 *     description: >
 *       Verifies the user’s password and grants a 30-minute step-up window required by all
 *       admin endpoints. Must be called before any `POST /admin/...` action is attempted.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 example: Str0ng!Passw0rd#
 *     responses:
 *       200:
 *         description: Step-up granted for 30 minutes.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Password is missing.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       401:
 *         description: Authentication failed (wrong password or inactive account).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
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
