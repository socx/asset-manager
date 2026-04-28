import type { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '@asset-manager/db';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';

/**
 * @openapi
 * /auth/verify-email:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email address
 *     description: Consumes the one-time token emailed after registration.
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           example: a3f9c2d7e1b4...
 *         description: SHA-256 pre-image token from the verification email.
 *     responses:
 *       200:
 *         description: Email verified (or already verified).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Token missing, invalid, or expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 */
export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const token = req.query['token'];

  if (typeof token !== 'string' || !token) {
    res.status(400).json({ message: 'Verification token is missing or invalid.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const record = await prisma.emailVerification.findFirst({
    where: { tokenHash },
    include: { user: { select: { id: true, status: true, email: true, role: true } } },
  });

  // No record found — token is invalid or was already cleared
  if (!record) {
    res.status(400).json({ message: 'This verification link is invalid or has already been used.' });
    return;
  }

  // Token already used
  if (record.usedAt) {
    res.status(200).json({ message: 'Your email has already been verified. You can now log in.' });
    return;
  }

  // User is already active (verified by another means or duplicate request)
  if (record.user.status === 'active') {
    res.status(200).json({ message: 'Your email has already been verified. You can now log in.' });
    return;
  }

  // Token expired
  if (record.expiresAt < new Date()) {
    res.status(400).json({
      message: 'This verification link has expired. Please request a new one.',
    });
    return;
  }

  // ── Mark token used + activate user atomically ─────────────────────────────
  await prisma.$transaction([
    prisma.emailVerification.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.user.id },
      data: {
        status: 'active',
        emailVerifiedAt: new Date(),
      },
    }),
  ]);

  await createAuditLog({
    actorId: record.user.id,
    actorRole: record.user.role,
    action: 'EMAIL_VERIFIED',
    entityType: 'user',
    entityId: record.user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  logger.info('[verify-email] Email verified', { userId: record.user.id });

  res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
}
