import type { Request, Response } from 'express';
import crypto from 'crypto';
import { verify as totpVerify } from 'otplib';
import { prisma } from '@asset-manager/db';
import { redis } from '../../lib/redis';
import {
  signAccessToken,
  refreshExpiryDate,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
} from '../../lib/jwt';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';

// The login handler stores { userId } in Redis under key `mfa_challenge:<nonce>` for 5 minutes.
const MFA_CHALLENGE_TTL = 5 * 60; // seconds
export const MFA_CHALLENGE_PREFIX = 'mfa_challenge:';

/**
 * @openapi
 * /auth/mfa/verify:
 *   post:
 *     tags: [MFA]
 *     summary: Complete MFA login challenge
 *     description: >
 *       Submit either a TOTP code or a backup code along with the `sessionChallenge`
 *       returned by `POST /auth/login` when MFA is required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionChallenge]
 *             properties:
 *               sessionChallenge:
 *                 type: string
 *                 format: uuid
 *                 description: Value returned by POST /auth/login when mfaRequired is true.
 *               totpCode:
 *                 type: string
 *                 example: '123456'
 *                 description: 6-digit TOTP code. Provide either this or backupCode.
 *               backupCode:
 *                 type: string
 *                 example: A3F9C2D7E1
 *                 description: One-time backup code. Provide either this or totpCode.
 *     responses:
 *       200:
 *         description: MFA verified; access token returned.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Missing or invalid fields.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       401:
 *         description: Invalid TOTP/backup code or expired challenge.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 */

// ── POST /auth/mfa/verify ─────────────────────────────────────────────────────
// Called after login returns { mfaRequired: true, sessionChallenge }.
// Body: { sessionChallenge, totpCode } OR { sessionChallenge, backupCode }

export async function mfaVerifyHandler(req: Request, res: Response): Promise<void> {
  const { sessionChallenge, totpCode, backupCode } = req.body as {
    sessionChallenge?: string;
    totpCode?: string;
    backupCode?: string;
  };

  if (!sessionChallenge) {
    res.status(400).json({ message: 'sessionChallenge is required.' });
    return;
  }
  if (!totpCode && !backupCode) {
    res.status(400).json({ message: 'Either totpCode or backupCode is required.' });
    return;
  }

  // ── 1. Look up challenge in Redis ─────────────────────────────────────────
  const redisKey = `${MFA_CHALLENGE_PREFIX}${sessionChallenge}`;
  const challengeData = await redis.get(redisKey);

  if (!challengeData) {
    res.status(401).json({ message: 'MFA challenge expired or invalid. Please log in again.' });
    return;
  }

  const { userId } = JSON.parse(challengeData) as { userId: string };

  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      mfaEnabled: true,
      mfaSecret: true,
    },
  });

  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    res.status(401).json({ message: 'Invalid session.' });
    return;
  }

  if (user.status !== 'active') {
    await redis.del(redisKey);
    res.status(401).json({ message: 'Account is not active.' });
    return;
  }

  // ── 2. Validate TOTP or backup code ───────────────────────────────────────
  let verified = false;

  if (totpCode) {
    const result = await totpVerify({ token: totpCode, secret: user.mfaSecret });
    verified = result.valid;
  } else if (backupCode) {
    const codeHash = crypto.createHash('sha256').update(backupCode.toUpperCase()).digest('hex');
    const dbCode = await prisma.mfaBackupCode.findFirst({
      where: { userId, codeHash, usedAt: null },
    });
    if (dbCode) {
      await prisma.mfaBackupCode.update({
        where: { id: dbCode.id },
        data: { usedAt: new Date() },
      });
      verified = true;
    }
  }

  if (!verified) {
    await createAuditLog({
      actorId: userId,
      actorRole: user.role,
      action: 'MFA_VERIFY_FAILED',
      entityType: 'user',
      entityId: userId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(401).json({ message: 'Invalid MFA code.' });
    return;
  }

  // ── 3. Challenge consumed — delete from Redis ─────────────────────────────
  await redis.del(redisKey);

  // ── 4. Issue tokens (same as login success) ───────────────────────────────
  const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  const rawRefreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  const expiresAt = refreshExpiryDate();

  await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      expiresAt,
    },
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'MFA_VERIFY_SUCCESS',
    entityType: 'user',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  logger.info('[mfa/verify] MFA verified, session created', { userId: user.id });

  res.cookie(REFRESH_COOKIE_NAME, rawRefreshToken, REFRESH_COOKIE_OPTIONS);
  res.status(200).json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  });
}

export { MFA_CHALLENGE_TTL };
