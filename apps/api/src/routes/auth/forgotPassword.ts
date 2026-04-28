import type { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '@asset-manager/db';
import type { ForgotPasswordInput } from '@asset-manager/types';
import { env } from '../../env';
import { queueEmail } from '../../lib/email';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { getNumSetting } from '../../lib/settings';

const GENERIC_RESPONSE = { message: 'If that email is registered you will receive a reset link shortly.' };

export async function forgotPasswordHandler(
  req: Request<Record<string, never>, unknown, ForgotPasswordInput>,
  res: Response,
): Promise<void> {
  const normalizedEmail = req.body.email.toLowerCase().trim();
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  // Always respond 200 — prevents email enumeration
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true, firstName: true, role: true, status: true },
  });

  if (!user || user.status !== 'active') {
    res.status(200).json(GENERIC_RESPONSE);
    return;
  }

  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const resetExpiryHours = await getNumSetting('PASSWORD_RESET_EXPIRY_HOURS');
  const expiresAt = new Date(Date.now() + resetExpiryHours * 3_600_000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  await queueEmail({
    type: 'reset_password',
    to: normalizedEmail,
    firstName: user.firstName,
    token: rawToken,
    baseUrl: env.APP_BASE_URL,
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'user',
    entityId: user.id,
    ipAddress,
    userAgent,
  });

  logger.info('[forgotPassword] Reset token issued', { userId: user.id });

  res.status(200).json(GENERIC_RESPONSE);
}
