import type { Response } from 'express';
import crypto from 'crypto';
import { generateSecret, generateURI, verify as totpVerify } from 'otplib';
import qrcode from 'qrcode';
import { prisma } from '@asset-manager/db';
import { env } from '../../env';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

const BACKUP_CODE_COUNT = 8;

/**
 * @openapi
 * /auth/mfa/setup:
 *   post:
 *     tags: [MFA]
 *     summary: Start MFA setup — generate TOTP secret
 *     description: Returns a TOTP secret, QR code data URL, and one-time backup codes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA setup initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 secret: { type: string }
 *                 qrCodeDataUrl: { type: string }
 *                 backupCodes:
 *                   type: array
 *                   items: { type: string }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: MFA already enabled.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *
 * /auth/mfa/confirm:
 *   post:
 *     tags: [MFA]
 *     summary: Confirm MFA setup with a TOTP code
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [totpCode]
 *             properties:
 *               totpCode: { type: string, example: '123456' }
 *     responses:
 *       200:
 *         description: MFA enabled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Invalid TOTP code.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /auth/mfa/disable:
 *   post:
 *     tags: [MFA]
 *     summary: Disable MFA
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [totpCode]
 *             properties:
 *               totpCode: { type: string, example: '123456' }
 *     responses:
 *       200:
 *         description: MFA disabled.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Invalid or missing TOTP code.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

function generateBackupCodes(): { raw: string[]; hashed: string[] } {
  const raw: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(5).toString('hex').toUpperCase(); // e.g. "A3F9C2D7E1"
    raw.push(code);
    hashed.push(crypto.createHash('sha256').update(code).digest('hex'));
  }
  return { raw, hashed };
}

// ── POST /auth/mfa/setup ──────────────────────────────────────────────────────

export async function mfaSetupHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: 'Unauthorized.' }); return; }
  const userId = req.user.sub;

  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { email: true, mfaEnabled: true },
  });

  if (!user) { res.status(404).json({ message: 'User not found.' }); return; }
  if (user.mfaEnabled) {
    res.status(409).json({ message: 'MFA is already enabled on this account.' });
    return;
  }

  const secret = generateSecret();
  const otpAuthUrl = generateURI({ issuer: env.TOTP_ISSUER, label: user.email, secret });
  const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);

  const { raw: backupCodes, hashed: hashedBackupCodes } = generateBackupCodes();

  // Persist pending secret and fresh backup codes (replace any existing unused ones)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    }),
    prisma.mfaBackupCode.deleteMany({ where: { userId } }),
    prisma.mfaBackupCode.createMany({
      data: hashedBackupCodes.map((codeHash) => ({ userId, codeHash })),
    }),
  ]);

  logger.info('[mfa/setup] TOTP secret generated', { userId });

  res.status(200).json({ secret, qrCodeDataUrl, backupCodes });
}

// ── POST /auth/mfa/confirm ────────────────────────────────────────────────────

export async function mfaConfirmHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: 'Unauthorized.' }); return; }
  const userId = req.user.sub;
  const { totpCode } = req.body as { totpCode?: string };

  if (!totpCode) {
    res.status(400).json({ message: 'totpCode is required.' });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true, role: true },
  });

  if (!user || !user.mfaSecret) {
    res.status(400).json({ message: 'MFA setup not initiated. Call /mfa/setup first.' });
    return;
  }

  if (user.mfaEnabled) {
    res.status(409).json({ message: 'MFA is already enabled on this account.' });
    return;
  }

  const { valid: isValid } = await totpVerify({ token: totpCode, secret: user.mfaSecret });
  if (!isValid) {
    res.status(400).json({ message: 'Invalid TOTP code. Please try again.' });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true },
  });

  await createAuditLog({
    actorId: userId,
    actorRole: user.role,
    action: 'MFA_ENABLED',
    entityType: 'user',
    entityId: userId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  logger.info('[mfa/confirm] MFA enabled', { userId });

  res.status(200).json({ message: 'MFA enabled successfully.' });
}

// ── POST /auth/mfa/disable ────────────────────────────────────────────────────

export async function mfaDisableHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: 'Unauthorized.' }); return; }
  const userId = req.user.sub;
  const { totpCode } = req.body as { totpCode?: string };

  if (!totpCode) {
    res.status(400).json({ message: 'totpCode is required.' });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabled: true, role: true },
  });

  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    res.status(400).json({ message: 'MFA is not enabled on this account.' });
    return;
  }

  const { valid: isValid } = await totpVerify({ token: totpCode, secret: user.mfaSecret });
  if (!isValid) {
    res.status(400).json({ message: 'Invalid TOTP code.' });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    }),
    prisma.mfaBackupCode.deleteMany({ where: { userId } }),
  ]);

  await createAuditLog({
    actorId: userId,
    actorRole: user.role,
    action: 'MFA_DISABLED',
    entityType: 'user',
    entityId: userId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  logger.info('[mfa/disable] MFA disabled', { userId });

  res.status(200).json({ message: 'MFA disabled.' });
}
