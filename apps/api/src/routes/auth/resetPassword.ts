import type { Request, Response } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import { prisma } from '@asset-manager/db';
import type { ResetPasswordInput } from '@asset-manager/types';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';

export async function resetPasswordHandler(
  req: Request<Record<string, never>, unknown, ResetPasswordInput>,
  res: Response,
): Promise<void> {
  const { token, newPassword } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null },
    include: { user: { select: { id: true, role: true, status: true } } },
  });

  if (!resetToken || resetToken.expiresAt < new Date()) {
    res.status(400).json({ message: 'Invalid or expired password reset token.' });
    return;
  }

  const newPasswordHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 4,
  });

  const now = new Date();

  await prisma.$transaction([
    // Update password
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: newPasswordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    // Mark token as used
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: now },
    }),
    // Revoke all active sessions — force re-login with new password
    prisma.userSession.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  await createAuditLog({
    actorId: resetToken.userId,
    actorRole: resetToken.user.role,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'user',
    entityId: resetToken.userId,
    ipAddress,
    userAgent,
  });

  logger.info('[resetPassword] Password reset completed', { userId: resetToken.userId });

  res.status(200).json({ message: 'Password reset successfully. Please log in with your new password.' });
}
