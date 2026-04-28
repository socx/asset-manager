import type { Response } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import { prisma } from '@asset-manager/db';
import type { Prisma } from '@prisma/client';
import { $Enums } from '@prisma/client';
import type { CreateUserInput, UpdateUserInput, SetUserStatusInput } from '@asset-manager/types';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import { queueEmail } from '../../lib/email';
import { env } from '../../env';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

// ── GET /api/v1/admin/users ───────────────────────────────────────────────────

export async function listUsersHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const {
    cursor,
    limit = '25',
    role,
    status,
    search,
  } = req.query as Record<string, string | undefined>;

  const take = Math.min(Math.max(parseInt(limit ?? '25', 10) || 25, 1), 100);

  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (role) where.role = role as $Enums.Role;
  if (status) where.status = status as $Enums.UserStatus;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: take + 1, // extra item to detect if there are more pages
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = users.length > take;
  const items = hasMore ? users.slice(0, take) : users;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ users: items, nextCursor });
}

// ── GET /api/v1/admin/users/:id ───────────────────────────────────────────────

export async function getUserHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  res.json({ user });
}

// ── POST /api/v1/admin/users ──────────────────────────────────────────────────

export async function createUserHandler(
  req: AuthenticatedRequest & { body: CreateUserInput },
  res: Response,
): Promise<void> {
  const { email, password, firstName, lastName, role } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' }, deletedAt: null },
    select: { id: true },
  });

  if (existing) {
    res.status(409).json({ message: 'A user with this email already exists.' });
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 4,
  });

  // Create user + verification token in a transaction
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        status: 'pending_verification',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await tx.emailVerification.create({
      data: { userId: newUser.id, tokenHash, expiresAt: verifyExpiresAt },
    });

    return newUser;
  });

  // Queue verification email (fire-and-forget)
  queueEmail({
    type: 'verify_email',
    to: user.email,
    firstName: user.firstName,
    token: rawToken,
    baseUrl: env.APP_BASE_URL,
  }).catch((err) => {
    logger.error('[admin/users] Failed to queue verification email', { userId: user.id, err });
  });

  await createAuditLog({
    actorId: req.user?.sub ?? '',
    actorRole: req.user?.role ?? '',
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: user.id,
    newValue: { id: user.id, email: user.email, role: user.role },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  logger.info('[admin/users] User created by admin', {
    actorId: req.user?.sub ?? '',
    newUserId: user.id,
  });

  res.status(201).json({ user });
}

// ── PATCH /api/v1/admin/users/:id ────────────────────────────────────────────

export async function updateUserHandler(
  req: AuthenticatedRequest & { body: UpdateUserInput },
  res: Response,
): Promise<void> {
  const id = req.params.id as string;
  const { firstName, lastName, email, role } = req.body;

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  });

  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  // Prevent admins from editing themselves (role demotion safety)
  // They may still edit name/email but not their own role
  if (id === req.user?.sub && role && role !== user.role) {
    res.status(400).json({ message: 'You cannot change your own role.' });
    return;
  }

  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== user.email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
          deletedAt: null,
          NOT: { id: { equals: id } },
        },
        select: { id: true },
      });
      if (existingEmail) {
        res.status(409).json({ message: 'A user with this email already exists.' });
        return;
      }
    }
  }

  const oldValue = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  };

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(firstName !== undefined ? { firstName: firstName.trim() } : {}),
      ...(lastName !== undefined ? { lastName: lastName.trim() } : {}),
      ...(email !== undefined ? { email: email.toLowerCase().trim() } : {}),
      ...(role !== undefined ? { role } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });

  const action =
    role !== undefined && role !== oldValue.role ? 'ROLE_CHANGED' : 'USER_UPDATED';

  await createAuditLog({
    actorId: req.user?.sub ?? '',
    actorRole: req.user?.role ?? '',
    action,
    entityType: 'user',
    entityId: id,
    oldValue,
    newValue: {
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      role: updated.role,
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ user: updated });
}

// ── PATCH /api/v1/admin/users/:id/status ─────────────────────────────────────

export async function setUserStatusHandler(
  req: AuthenticatedRequest & { body: SetUserStatusInput },
  res: Response,
): Promise<void> {
  const id = req.params.id as string;
  const { status } = req.body;

  // Prevent self-disable
  if (id === req.user?.sub) {
    res.status(400).json({ message: 'You cannot change your own account status.' });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  if (user.status === status) {
    res.json({ message: `User is already ${status}.` });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: { status },
  });

  // Revoke all sessions when disabling
  if (status === 'disabled') {
    await prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const action = status === 'active' ? 'USER_ENABLED' : 'USER_DISABLED';

  await createAuditLog({
    actorId: req.user?.sub ?? '',
    actorRole: req.user?.role ?? '',
    action,
    entityType: 'user',
    entityId: id,
    oldValue: { status: user.status },
    newValue: { status },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ message: `User ${status === 'active' ? 'enabled' : 'disabled'} successfully.` });
}

// ── DELETE /api/v1/admin/users/:id ───────────────────────────────────────────

export async function deleteUserHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  // Prevent self-deletion
  if (id === req.user?.sub) {
    res.status(400).json({ message: 'You cannot delete your own account.' });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'disabled' },
    }),
    prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await createAuditLog({
    actorId: req.user?.sub ?? '',
    actorRole: req.user?.role ?? '',
    action: 'USER_DELETED',
    entityType: 'user',
    entityId: id,
    oldValue: { email: user.email, role: user.role },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ message: 'User deleted successfully.' });
}

// ── POST /api/v1/admin/users/:id/reset-mfa ───────────────────────────────────

export async function resetUserMfaHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, mfaEnabled: true },
  });

  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { mfaEnabled: false, mfaSecret: null },
    }),
    prisma.mfaBackupCode.deleteMany({ where: { userId: id } }),
  ]);

  await createAuditLog({
    actorId: req.user?.sub ?? '',
    actorRole: req.user?.role ?? '',
    action: 'USER_MFA_RESET',
    entityType: 'user',
    entityId: id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ message: 'MFA reset successfully. User will be prompted to set up MFA again.' });
}

// ── GET /api/v1/admin/users/:id/sessions ─────────────────────────────────────

export async function listUserSessionsHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return;
  }

  const sessions = await prisma.userSession.findMany({
    where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ sessions });
}

// ── DELETE /api/v1/admin/users/:id/sessions/:sessionId ───────────────────────

export async function revokeUserSessionHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;
  const sessionId = req.params.sessionId as string;

  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId: id, revokedAt: null },
    select: { id: true },
  });

  if (!session) {
    res.status(404).json({ message: 'Session not found.' });
    return;
  }

  await prisma.userSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  await createAuditLog({
    actorId: req.user?.sub ?? '',
    actorRole: req.user?.role ?? '',
    action: 'USER_SESSION_REVOKED',
    entityType: 'user_session',
    entityId: sessionId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ message: 'Session revoked successfully.' });
}
