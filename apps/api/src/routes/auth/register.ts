import type { Request, Response } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import { prisma } from '@asset-manager/db';
import type { RegisterInput } from '@asset-manager/types';
import { env } from '../../env';
import { queueEmail } from '../../lib/email';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';

export async function registerHandler(
  req: Request<Record<string, never>, unknown, RegisterInput>,
  res: Response,
): Promise<void> {
  const { email, password, firstName, lastName } = req.body;

  // ── 1. Check self-registration system setting ──────────────────────────────
  let selfRegistrationEnabled = env.SELF_REGISTRATION_ENABLED;
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'SELF_REGISTRATION_ENABLED' },
      select: { value: true },
    });
    if (setting !== null) {
      selfRegistrationEnabled = setting.value === 'true';
    }
  } catch (err) {
    logger.error('[register] Failed to read SELF_REGISTRATION_ENABLED setting', { err });
    // Fall back to env var — do not abort
  }

  if (!selfRegistrationEnabled) {
    res.status(403).json({
      message: 'Self-registration is disabled. Contact an administrator.',
    });
    return;
  }

  // ── 2. Normalise email and check for duplicates ────────────────────────────
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) {
    res.status(409).json({ message: 'An account with this email already exists.' });
    return;
  }

  // ── 3. Hash password with Argon2id ─────────────────────────────────────────
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536, // 64 MiB
    timeCost: 3,
    parallelism: 4,
  });

  // ── 4. Persist user + verification token atomically ───────────────────────
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName,
        lastName,
        status: 'pending_verification',
        role: 'asset_owner',
      },
    });

    await tx.emailVerification.create({
      data: {
        userId: newUser.id,
        tokenHash,
        expiresAt,
      },
    });

    return newUser;
  });

  // ── 5. Queue verification email (non-blocking) ─────────────────────────────
  await queueEmail({
    type: 'verify_email',
    to: normalizedEmail,
    firstName,
    token: rawToken,
    baseUrl: env.APP_BASE_URL,
  });

  // ── 6. Write audit log (non-blocking) ─────────────────────────────────────
  await createAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'USER_REGISTERED',
    entityType: 'user',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  logger.info('[register] New user registered', { userId: user.id, email: normalizedEmail });

  res.status(201).json({ message: 'Verification email sent. Please check your inbox.' });
}
