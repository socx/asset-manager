import type { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '@asset-manager/db';
import type { ResendVerificationInput } from '@asset-manager/types';
import { env } from '../../env';
import { queueEmail } from '../../lib/email';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';

const GENERIC_OK = { message: 'If your email is registered and unverified, a new verification email has been sent.' };

export async function resendVerificationHandler(
  req: Request<Record<string, never>, unknown, ResendVerificationInput>,
  res: Response,
): Promise<void> {
  const { email } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true, email: true, firstName: true, status: true, role: true },
  });

  // Always return 200 regardless of outcome — prevents user enumeration
  if (!user) {
    res.status(200).json(GENERIC_OK);
    return;
  }

  if (user.status === 'active') {
    res.status(200).json({ message: 'Your email is already verified. You can log in.' });
    return;
  }

  if (user.status !== 'pending_verification') {
    // Disabled or other non-actionable status — return generic message
    res.status(200).json(GENERIC_OK);
    return;
  }

  // Invalidate all existing unused tokens for this user, then issue a new one
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);

  await prisma.$transaction([
    prisma.emailVerification.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerification.create({
      data: { userId: user.id, tokenHash, expiresAt },
    }),
  ]);

  await queueEmail({
    type: 'verify_email',
    to: user.email,
    firstName: user.firstName,
    token: rawToken,
    baseUrl: env.APP_BASE_URL,
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'VERIFICATION_EMAIL_RESENT',
    entityType: 'user',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  logger.info('[resend-verification] Verification email resent', { userId: user.id });

  res.status(200).json(GENERIC_OK);
}
