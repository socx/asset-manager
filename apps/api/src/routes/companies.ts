import { Router, type Response } from 'express';
import { prisma } from '@asset-manager/db';
import { requireAuth } from '../middleware/requireAuth';
import { logger } from '../lib/logger';
import type { AuthenticatedRequest } from '../middleware/requireAuth';

export const companiesRouter = Router();

/**
 * @openapi
 * /companies:
 *   get:
 *     tags: [Companies]
 *     summary: List active companies (optionally filtered by name)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Case-insensitive name search (typeahead)
 *     responses:
 *       200:
 *         description: List of active companies.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
companiesRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : undefined;

  try {
    const companies = await prisma.company.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        companyType: { select: { id: true, name: true } },
        city: true,
        country: true,
      },
      take: 50,
    });
    res.json({ companies });
  } catch (err) {
    logger.error('[companies] Failed to fetch companies', { err });
    res.status(500).json({ message: 'Failed to fetch companies' });
  }
});
