import type { Request, Response } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import { prisma } from '@asset-manager/db';
import type { LoginInput } from '@asset-manager/types';
import {
  signAccessToken,
  refreshExpiryDate,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
} from '../../lib/jwt';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { MFA_CHALLENGE_PREFIX, MFA_CHALLENGE_TTL } from './mfaVerify';

const INVALID_CREDENTIALS = { message: 'Invalid credentials.' };
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1_000; // 30 minutes

export async function loginHandler(
  req: Request<Record<string, never>, unknown, LoginInput>,
  res: Response,
): Promise<void> {
  const { email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      mfaEnabled: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  });

  // ── 1. User not found — respond identically to wrong password ──────────────
  if (!user) {
    res.status(401).json(INVALID_CREDENTIALS);
    return;
  }

  // ── 2. Account lock check ─────────────────────────────────────────────────
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const secondsRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1_000);
    res.status(423).json({
      message: `Account temporarily locked. Try again in ${secondsRemaining} seconds.`,
      retryAfter: secondsRemaining,
    });
    return;
  }

  // ── 3. Status checks ──────────────────────────────────────────────────────
  if (user.status === 'pending_verification') {
    res.status(403).json({
      message: 'Please verify your email address before logging in.',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return;
  }

  if (user.status === 'disabled') {
    res.status(403).json({ message: 'This account has been disabled. Contact an administrator.' });
    return;
  }

  // ── 4. Verify password ────────────────────────────────────────────────────
  const passwordValid = await argon2.verify(user.passwordHash, password);

  if (!passwordValid) {
    const newFailCount = user.failedLoginAttempts + 1;
    const shouldLock = newFailCount >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newFailCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : undefined,
      },
    });

    await createAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'USER_LOGIN_FAILED',
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    if (shouldLock) {
      res.status(423).json({
        message: `Too many failed attempts. Account locked for 30 minutes.`,
        retryAfter: LOCK_DURATION_MS / 1_000,
      });
      return;
    }

    res.status(401).json(INVALID_CREDENTIALS);
    return;
  }

  // ── 5. MFA gate ──────────────────────────────────────────────────────────
  if (user.mfaEnabled) {
    const sessionChallenge = crypto.randomBytes(32).toString('hex');
    await redis.set(
      `${MFA_CHALLENGE_PREFIX}${sessionChallenge}`,
      JSON.stringify({ userId: user.id }),
      'EX',
      MFA_CHALLENGE_TTL,
    );
    // Reset failed attempts now that password was correct
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    res.status(200).json({ mfaRequired: true, sessionChallenge });
    return;
  }

  // ── 6. Issue tokens ───────────────────────────────────────────────────────
  // Reset failed attempts and record last login timestamp
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });

  const rawRefreshToken = crypto.randomBytes(32).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  const expiresAt = refreshExpiryDate();

  await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'USER_LOGIN_SUCCESS',
    entityType: 'user',
    entityId: user.id,
    ipAddress,
    userAgent,
  });

  logger.info('[login] User logged in', { userId: user.id });

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
