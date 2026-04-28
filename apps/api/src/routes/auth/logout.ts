import type { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '@asset-manager/db';
import { REFRESH_COOKIE_NAME } from '../../lib/jwt';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

export async function logoutHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const rawToken = req.cookies[REFRESH_COOKIE_NAME] as string | undefined;

  if (rawToken) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await prisma.userSession.updateMany({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Clear the cookie regardless of whether a session was found
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });

  if (req.user) {
    await createAuditLog({
      actorId: req.user.sub,
      actorRole: req.user.role,
      action: 'USER_LOGOUT',
      entityType: 'user',
      entityId: req.user.sub,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    logger.info('[logout] User logged out', { userId: req.user.sub });
  }

  res.status(200).json({ message: 'Logged out successfully.' });
}
