import type { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '@asset-manager/db';
import {
  signAccessToken,
  refreshExpiryDate,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
} from '../../lib/jwt';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import type { AccessTokenPayload } from '../../lib/jwt';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Sessions]
 *     summary: Refresh access token
 *     description: >
 *       Rotates the `refresh_token` HttpOnly cookie and returns a new short-lived access token.
 *       The old refresh token is immediately invalidated (token rotation).
 *     responses:
 *       200:
 *         description: New access token issued.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: No refresh token, or token is invalid/expired/revoked.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *
 * /auth/sessions:
 *   get:
 *     tags: [Sessions]
 *     summary: List active sessions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active sessions for the authenticated user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Session'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   delete:
 *     tags: [Sessions]
 *     summary: Revoke all sessions
 *     description: Revokes every active session for the authenticated user (logs out everywhere).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions revoked.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /auth/sessions/{sessionId}:
 *   delete:
 *     tags: [Sessions]
 *     summary: Revoke a specific session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Session revoked.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

// ── Token Refresh (POST /auth/refresh) ────────────────────────────────────────

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;

  if (!rawToken) {
    res.status(401).json({ message: 'No refresh token provided.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const session = await prisma.userSession.findFirst({
    where: { refreshTokenHash: tokenHash },
    include: {
      user: { select: { id: true, email: true, role: true, status: true } },
    },
  });

  // ── Detect token replay (theft): hash not found means it was already rotated ─
  if (!session) {
    // A token that was previously valid but is no longer in the DB means rotation
    // already happened — revoke ALL sessions for this user as a precaution.
    // We can't identify the user from the hash alone at this point, so just 401.
    res.status(401).json({ message: 'Invalid or expired refresh token.' });
    return;
  }

  // Revoked or expired session
  if (session.revokedAt || session.expiresAt < new Date()) {
    // If revoked, possible token theft — revoke all sessions for this user
    if (session.revokedAt) {
      await prisma.userSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      logger.warn('[refresh] Replayed revoked token — all sessions revoked', {
        userId: session.userId,
      });
    }
    res.status(401).json({ message: 'Invalid or expired refresh token.' });
    return;
  }

  if (session.user.status !== 'active') {
    res.status(401).json({ message: 'Account is not active.' });
    return;
  }

  // ── Rotate: revoke old session, create new one ────────────────────────────
  const newRawToken = crypto.randomBytes(32).toString('hex');
  const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');
  const expiresAt = refreshExpiryDate();

  await prisma.$transaction([
    prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.userSession.create({
      data: {
        userId: session.userId,
        refreshTokenHash: newTokenHash,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        expiresAt,
      },
    }),
  ]);

  const accessToken = signAccessToken({
    sub: session.user.id,
    role: session.user.role,
    email: session.user.email,
  });

  res.cookie(REFRESH_COOKIE_NAME, newRawToken, REFRESH_COOKIE_OPTIONS);
  res.status(200).json({ accessToken });
}

// ── List sessions (GET /auth/sessions) ───────────────────────────────────────

export async function listSessionsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: 'Unauthorized.' }); return; }
  const userId = req.user.sub;

  const sessions = await prisma.userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ sessions });
}

// ── Revoke one session (DELETE /auth/sessions/:sessionId) ─────────────────────

export async function revokeSessionHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: 'Unauthorized.' }); return; }
  const userId = req.user.sub;
  const sessionId = req.params['sessionId'] as string;

  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId },
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
    actorId: userId,
    action: 'SESSION_REVOKED',
    entityType: 'user_session',
    entityId: sessionId,
    // sessionId is guaranteed string above
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json({ message: 'Session revoked.' });
}

// ── Revoke all sessions (DELETE /auth/sessions) ───────────────────────────────

export async function revokeAllSessionsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: 'Unauthorized.' }); return; }
  const userId = req.user.sub;

  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await createAuditLog({
    actorId: userId,
    action: 'ALL_SESSIONS_REVOKED',
    entityType: 'user',
    entityId: userId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(200).json({ message: 'All sessions revoked.' });
}

// Re-export AccessTokenPayload for convenience
export type { AccessTokenPayload };
