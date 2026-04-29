import type { Response } from 'express';
import argon2 from 'argon2';
import { prisma } from '@asset-manager/db';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

/**
 * @openapi
 * /auth/profile/password:
 *   patch:
 *     tags: [Auth]
 *     summary: Change the authenticated user's password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully.
 *       400:
 *         description: Validation error or new password same as current.
 *       401:
 *         description: Current password is incorrect.
 *       404:
 *         description: User not found.
 */
export async function changePasswordHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.sub ?? '';
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  const validPassword = await argon2.verify(user.passwordHash, currentPassword);
  if (!validPassword) {
    res.status(401).json({ message: 'Current password is incorrect.' });
    return;
  }

  const newHash = await argon2.hash(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

  logger.info('User changed their password', { userId });
  res.status(200).json({ message: 'Password changed successfully.' });
}
