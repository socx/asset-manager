import type { Response } from 'express';
import { prisma } from '@asset-manager/db';
import { LOOKUP_ITEM_TYPES, type LookupItemType, type CreateLookupItemInput, type UpdateLookupItemInput } from '@asset-manager/types';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

// ── List all items for a type (including inactive) ────────────────────────────

export async function listLookupItemsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const type = req.params.type as string;

  if (!(LOOKUP_ITEM_TYPES as readonly string[]).includes(type)) {
    res.status(400).json({ message: `Unknown lookup type: ${type}` });
    return;
  }

  try {
    const items = await prisma.lookupItem.findMany({
      where: { type: type as LookupItemType },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ items });
  } catch (err) {
    logger.error('[admin/lookupItems] listLookupItems error', { err });
    res.status(500).json({ message: 'Failed to fetch lookup items' });
  }
}

// ── Create a lookup item ──────────────────────────────────────────────────────

export async function createLookupItemHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const type = req.params.type as string;

  if (!(LOOKUP_ITEM_TYPES as readonly string[]).includes(type)) {
    res.status(400).json({ message: `Unknown lookup type: ${type}` });
    return;
  }

  const body = req.body as CreateLookupItemInput;

  try {
    // Auto-assign sort order if not provided: max + 1 within this type
    let { sortOrder } = body;
    if (!sortOrder) {
      const max = await prisma.lookupItem.aggregate({
        where: { type: type as LookupItemType },
        _max: { sortOrder: true },
      });
      sortOrder = (max._max.sortOrder ?? 0) + 1;
    }

    const item = await prisma.lookupItem.create({
      data: {
        type: type as LookupItemType,
        name: body.name,
        description: body.description ?? null,
        sortOrder,
      },
    });

    await createAuditLog({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'lookup_item.create',
      entityType: 'LookupItem',
      entityId: item.id,
      newValue: item,
    });

    res.status(201).json({ item });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('Unique constraint')
    ) {
      res.status(409).json({ message: `An item named "${body.name}" already exists for type "${type}"` });
      return;
    }
    logger.error('[admin/lookupItems] createLookupItem error', { err });
    res.status(500).json({ message: 'Failed to create lookup item' });
  }
}

// ── Update a lookup item ──────────────────────────────────────────────────────

export async function updateLookupItemHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = req.body as UpdateLookupItemInput;

  try {
    const existing = await prisma.lookupItem.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: 'Lookup item not found' });
      return;
    }

    const item = await prisma.lookupItem.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await createAuditLog({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'lookup_item.update',
      entityType: 'LookupItem',
      entityId: item.id,
      oldValue: existing,
      newValue: item,
    });

    res.json({ item });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('Unique constraint')
    ) {
      res.status(409).json({ message: `An item with that name already exists in this type` });
      return;
    }
    logger.error('[admin/lookupItems] updateLookupItem error', { err });
    res.status(500).json({ message: 'Failed to update lookup item' });
  }
}

// ── Delete (hard) a lookup item — blocked if referenced ───────────────────────

export async function deleteLookupItemHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  try {
    const existing = await prisma.lookupItem.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });

    if (!existing) {
      res.status(404).json({ message: 'Lookup item not found' });
      return;
    }

    if (existing._count.companies > 0) {
      res.status(409).json({
        message: `This item is referenced by ${existing._count.companies} company record(s) and cannot be deleted. Deactivate it instead.`,
      });
      return;
    }

    await prisma.lookupItem.delete({ where: { id } });

    await createAuditLog({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'lookup_item.delete',
      entityType: 'LookupItem',
      entityId: id,
      oldValue: existing,
    });

    res.json({ message: 'Lookup item deleted' });
  } catch (err) {
    logger.error('[admin/lookupItems] deleteLookupItem error', { err });
    res.status(500).json({ message: 'Failed to delete lookup item' });
  }
}
