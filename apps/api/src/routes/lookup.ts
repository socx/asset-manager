import { Router, type Response } from 'express';
import { prisma } from '@asset-manager/db';
import { LOOKUP_ITEM_TYPES, type LookupItemType } from '@asset-manager/types';
import { requireAuth } from '../middleware/requireAuth';
import { logger } from '../lib/logger';
import type { AuthenticatedRequest } from '../middleware/requireAuth';

export const lookupRouter = Router();

/**
 * @openapi
 * /lookup/{type}:
 *   get:
 *     tags: [Lookup]
 *     summary: List active lookup items for a given type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: type
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of active lookup items ordered by sortOrder.
 *       400:
 *         description: Unknown lookup type.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
lookupRouter.get('/:type', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const type = req.params.type as string;

  if (!(LOOKUP_ITEM_TYPES as readonly string[]).includes(type)) {
    res.status(400).json({ message: `Unknown lookup type: ${type}` });
    return;
  }

  try {
    const items = await prisma.lookupItem.findMany({
      where: { type: type as LookupItemType, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, description: true, sortOrder: true },
    });
    res.json({ items });
  } catch (err) {
    logger.error('[lookup] Failed to fetch lookup items', { type, err });
    res.status(500).json({ message: 'Failed to fetch lookup items' });
  }
});
