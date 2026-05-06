import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '@asset-manager/db';
import {
  Role,
  createPropertyAssetSchema,
  updatePropertyAssetSchema,
  createValuationEntryInputSchema,
  updateValuationEntrySchema,
  createMortgageEntryInputSchema,
  updateMortgageEntrySchema,
  createShareholdingEntryInputSchema,
  updateShareholdingEntrySchema,
  createTransactionEntryInputSchema,
  updateTransactionEntrySchema,
  type CreatePropertyAssetInput,
  type UpdatePropertyAssetInput,
  type CreateValuationEntryInput,
  type UpdateValuationEntryInput,
  type CreateMortgageEntryInput,
  type UpdateMortgageEntryInput,
  type CreateShareholdingEntryInput,
  type UpdateShareholdingEntryInput,
  type CreateTransactionEntryInput,
  type UpdateTransactionEntryInput,
} from '@asset-manager/types';
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { logger } from '../lib/logger';
import { createAuditLog } from '../lib/audit';

export const assetsRouter = Router();

assetsRouter.use(requireAuth);

const ADMIN_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN]);

const PROPERTY_LIST_SELECT = {
  id: true,
  code: true,
  customAlias: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  county: true,
  postCode: true,
  country: true,
  propertyStatus: { select: { id: true, name: true } },
  propertyPurpose: { select: { id: true, name: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  managedByUser: { select: { id: true, firstName: true, lastName: true } },
  managedByCompany: { select: { id: true, name: true } },
  valuations: {
    select: { valuationDate: true, valuationAmount: true },
    orderBy: { valuationDate: 'desc' as const },
    take: 1,
  },
  createdAt: true,
  updatedAt: true,
} as const;

const PROPERTY_DETAIL_SELECT = {
  id: true,
  code: true,
  customAlias: true,
  assetClassId: true,
  ownerId: true,
  managedByUserId: true,
  managedByCompanyId: true,
  ownershipTypeId: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  county: true,
  postCode: true,
  country: true,
  propertyStatusId: true,
  propertyPurposeId: true,
  description: true,
  purchaseDate: true,
  purchasePrice: true,
  isFinanced: true,
  depositPaid: true,
  dutiesTaxes: true,
  legalFees: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  managedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  managedByCompany: { select: { id: true, name: true } },
  assetClass: { select: { id: true, name: true } },
  ownershipType: { select: { id: true, name: true } },
  propertyStatus: { select: { id: true, name: true } },
  propertyPurpose: { select: { id: true, name: true } },
  valuations: { orderBy: { valuationDate: 'desc' as const } },
  mortgages: { orderBy: { startDate: 'desc' as const } },
  shareholdings: { orderBy: { createdAt: 'asc' as const } },
  transactions: { orderBy: { date: 'desc' as const } },
} as const;

function isAdmin(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

function requireActor(req: AuthenticatedRequest, res: Response) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Authentication required.' });
    return null;
  }
  return user;
}

function canViewAsset(userId: string, role: string, ownerId: string, managedByUserId: string | null): boolean {
  return isAdmin(role) || ownerId === userId || managedByUserId === userId;
}

function canDeleteAsset(userId: string, role: string, ownerId: string): boolean {
  return isAdmin(role) || ownerId === userId;
}

function decimalOrNull(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value);
}

function decimalOrUndefined(value: number | null | undefined): Prisma.Decimal | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Prisma.Decimal(value);
}

function normalizeOwnershipTotal(entries: Array<{ ownershipPercent: number }>): number {
  return Number(entries.reduce((acc, cur) => acc + cur.ownershipPercent, 0).toFixed(2));
}

async function resolvePropertyAssetClassId(inputId?: string): Promise<string | null> {
  if (inputId) {
    const byId = await prisma.lookupItem.findFirst({
      where: { id: inputId, type: 'asset_class', name: { equals: 'Property', mode: 'insensitive' } },
      select: { id: true },
    });
    return byId?.id ?? null;
  }

  const propertyClass = await prisma.lookupItem.findFirst({
    where: { type: 'asset_class', name: { equals: 'Property', mode: 'insensitive' }, isActive: true },
    select: { id: true },
  });
  return propertyClass?.id ?? null;
}

async function getNextPropertyCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ code: string }>>`
    SELECT code
    FROM property_assets
    WHERE code ~ '^PROP-[0-9]+$'
    ORDER BY CAST(SUBSTRING(code FROM 6) AS INTEGER) DESC
    LIMIT 1
  `;

  const current = rows[0]?.code;
  const last = current ? Number(current.slice(5)) : 0;
  return `PROP-${String(last + 1).padStart(5, '0')}`;
}

async function findAccessibleAsset(assetId: string, req: AuthenticatedRequest) {
  const userId = req.user?.sub;
  const role = req.user?.role;
  if (!userId || !role) {
    return null;
  }

  const asset = await prisma.propertyAsset.findFirst({
    where: {
      id: assetId,
      deletedAt: null,
      ...(isAdmin(role)
        ? {}
        : {
            OR: [{ ownerId: userId }, { managedByUserId: userId }],
          }),
    },
    select: { id: true, ownerId: true, managedByUserId: true },
  });

  return asset;
}

// List property assets
assetsRouter.get('/properties', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const actor = requireActor(req, res);
  if (!actor) return;

  const userId = actor.sub;
  const role = actor.role;
  const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
  const limit = Math.min(Number(req.query['limit']) || 20, 100);
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';

  try {
    const rows = await prisma.propertyAsset.findMany({
      where: {
        deletedAt: null,
        ...(isAdmin(role)
          ? {}
          : {
              OR: [{ ownerId: userId }, { managedByUserId: userId }],
            }),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: 'insensitive' } },
                { customAlias: { contains: q, mode: 'insensitive' } },
                { addressLine1: { contains: q, mode: 'insensitive' } },
                { addressLine2: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { county: { contains: q, mode: 'insensitive' } },
                { postCode: { contains: q, mode: 'insensitive' } },
                { owner: { firstName: { contains: q, mode: 'insensitive' } } },
                { owner: { lastName: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: PROPERTY_LIST_SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    res.json({ assets: items, nextCursor: hasMore ? items[items.length - 1].id : null });
  } catch (err) {
    logger.error('[assets] listProperties error', { err });
    res.status(500).json({ message: 'Failed to fetch assets' });
  }
});

// Create property asset
assetsRouter.post('/properties', validate(createPropertyAssetSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const body = req.body as CreatePropertyAssetInput;
  const actor = requireActor(req, res);
  if (!actor) return;

  const userId = actor.sub;
  const role = actor.role;

  if (body.managedByUserId && body.managedByCompanyId) {
    res.status(400).json({ message: 'Only one manager type is allowed: user or company' });
    return;
  }

  if (body.shareholdings && body.shareholdings.length > 0 && normalizeOwnershipTotal(body.shareholdings) !== 100) {
    res.status(400).json({ message: 'Shareholding ownershipPercent total must equal 100' });
    return;
  }

  try {
    const assetClassId = await resolvePropertyAssetClassId(body.assetClassId);
    if (!assetClassId) {
      res.status(400).json({ message: 'Asset class must resolve to Property' });
      return;
    }

    const ownerId = isAdmin(role) && body.ownerId ? body.ownerId : userId;

    const created = await prisma.$transaction(async (tx) => {
      let createdAsset: { id: string } | null = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const code = await getNextPropertyCode(tx);
          const row = await tx.propertyAsset.create({
            data: {
              code,
              customAlias: body.customAlias ?? null,
              assetClassId,
              ownerId,
              managedByUserId: body.managedByUserId ?? null,
              managedByCompanyId: body.managedByCompanyId ?? null,
              ownershipTypeId: body.ownershipTypeId,
              addressLine1: body.addressLine1,
              addressLine2: body.addressLine2 ?? null,
              city: body.city,
              county: body.county ?? null,
              postCode: body.postCode,
              country: body.country,
              propertyStatusId: body.propertyStatusId,
              propertyPurposeId: body.propertyPurposeId,
              description: body.description ?? null,
              purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
              purchasePrice: decimalOrNull(body.purchasePrice),
              isFinanced: body.isFinanced ?? null,
              depositPaid: decimalOrNull(body.depositPaid),
              dutiesTaxes: decimalOrNull(body.dutiesTaxes),
              legalFees: decimalOrNull(body.legalFees),
            },
            select: { id: true },
          });
          createdAsset = row;
          break;
        } catch (err: unknown) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError
            && err.code === 'P2002'
            && Array.isArray(err.meta?.target)
            && (err.meta?.target as string[]).includes('code')
          ) {
            continue;
          }
          throw err;
        }
      }

      if (!createdAsset) {
        throw new Error('Failed to generate unique property code');
      }

      const createdAssetId = createdAsset.id;

      if (body.valuations?.length) {
        await tx.valuationEntry.createMany({
          data: body.valuations.map((v) => ({
            assetId: createdAssetId,
            valuationDate: new Date(v.valuationDate),
            valuationAmount: new Prisma.Decimal(v.valuationAmount),
            valuationMethod: v.valuationMethod,
            valuedBy: v.valuedBy ?? null,
            notes: v.notes ?? null,
          })),
        });
      }

      if (body.mortgages?.length) {
        await tx.mortgageEntry.createMany({
          data: body.mortgages.map((m) => ({
            assetId: createdAssetId,
            lender: m.lender,
            productName: m.productName ?? null,
            mortgageTypeId: m.mortgageTypeId,
            loanAmount: new Prisma.Decimal(m.loanAmount),
            interestRate: m.interestRate !== undefined ? new Prisma.Decimal(m.interestRate) : null,
            termYears: m.termYears ?? null,
            paymentStatusId: m.paymentStatusId,
            startDate: new Date(m.startDate),
            settledAt: m.settledAt ? new Date(m.settledAt) : null,
            notes: m.notes ?? null,
          })),
        });
      }

      if (body.shareholdings?.length) {
        await tx.shareholdingEntry.createMany({
          data: body.shareholdings.map((s) => ({
            assetId: createdAssetId,
            shareholderName: s.shareholderName,
            ownershipPercent: new Prisma.Decimal(s.ownershipPercent),
            profitPercent: new Prisma.Decimal(s.profitPercent),
            notes: s.notes ?? null,
          })),
        });
      }

      if (body.transactions?.length) {
        await tx.transactionEntry.createMany({
          data: body.transactions.map((t) => ({
            assetId: createdAssetId,
            date: new Date(t.date),
            description: t.description,
            amount: new Prisma.Decimal(t.amount),
            categoryId: t.categoryId,
          })),
        });
      }

      return tx.propertyAsset.findUnique({ where: { id: createdAssetId }, select: PROPERTY_DETAIL_SELECT });
    });

    await createAuditLog({
      actorId: userId,
      actorRole: role,
      action: 'property_asset.create',
      entityType: 'PropertyAsset',
      entityId: created?.id,
      newValue: created,
    });

    res.status(201).json({ asset: created });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'Property alias must be unique' });
      return;
    }
    logger.error('[assets] createProperty error', { err });
    res.status(500).json({ message: 'Failed to create property asset' });
  }
});

// Property detail
assetsRouter.get('/properties/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const actor = requireActor(req, res);
  if (!actor) return;

  const userId = actor.sub;
  const role = actor.role;

  try {
    const asset = await prisma.propertyAsset.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(isAdmin(role)
          ? {}
          : {
              OR: [{ ownerId: userId }, { managedByUserId: userId }],
            }),
      },
      select: PROPERTY_DETAIL_SELECT,
    });

    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    res.json({ asset });
  } catch (err) {
    logger.error('[assets] getProperty error', { err });
    res.status(500).json({ message: 'Failed to fetch asset detail' });
  }
});

// Update property
assetsRouter.patch('/properties/:id', validate(updatePropertyAssetSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const body = req.body as UpdatePropertyAssetInput;
  const actor = requireActor(req, res);
  if (!actor) return;

  const userId = actor.sub;
  const role = actor.role;

  if (body.managedByUserId && body.managedByCompanyId) {
    res.status(400).json({ message: 'Only one manager type is allowed: user or company' });
    return;
  }

  try {
    const existing = await findAccessibleAsset(id, req);
    if (!existing) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    if (!canViewAsset(userId, role, existing.ownerId, existing.managedByUserId)) {
      res.status(403).json({ message: 'Insufficient permissions.' });
      return;
    }

    const row = await prisma.propertyAsset.findUnique({ where: { id }, select: { customAlias: true, ownerId: true } });
    if (!row) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    if (body.ownerId && !isAdmin(role)) {
      res.status(403).json({ message: 'Only admins may change owner' });
      return;
    }

    if (body.customAlias !== undefined && row.customAlias) {
      res.status(400).json({ message: 'Custom alias is immutable once set' });
      return;
    }

    const updated = await prisma.propertyAsset.update({
      where: { id },
      data: {
        ...(body.customAlias !== undefined && { customAlias: body.customAlias }),
        ...(body.ownerId !== undefined && { ownerId: body.ownerId }),
        ...(body.managedByUserId !== undefined && { managedByUserId: body.managedByUserId }),
        ...(body.managedByCompanyId !== undefined && { managedByCompanyId: body.managedByCompanyId }),
        ...(body.ownershipTypeId !== undefined && { ownershipTypeId: body.ownershipTypeId }),
        ...(body.addressLine1 !== undefined && { addressLine1: body.addressLine1 }),
        ...(body.addressLine2 !== undefined && { addressLine2: body.addressLine2 }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.county !== undefined && { county: body.county }),
        ...(body.postCode !== undefined && { postCode: body.postCode }),
        ...(body.country !== undefined && { country: body.country }),
        ...(body.propertyStatusId !== undefined && { propertyStatusId: body.propertyStatusId }),
        ...(body.propertyPurposeId !== undefined && { propertyPurposeId: body.propertyPurposeId }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.purchaseDate !== undefined && { purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null }),
        ...(body.purchasePrice !== undefined && { purchasePrice: decimalOrUndefined(body.purchasePrice) }),
        ...(body.isFinanced !== undefined && { isFinanced: body.isFinanced }),
        ...(body.depositPaid !== undefined && { depositPaid: decimalOrUndefined(body.depositPaid) }),
        ...(body.dutiesTaxes !== undefined && { dutiesTaxes: decimalOrUndefined(body.dutiesTaxes) }),
        ...(body.legalFees !== undefined && { legalFees: decimalOrUndefined(body.legalFees) }),
      },
      select: PROPERTY_DETAIL_SELECT,
    });

    await createAuditLog({
      actorId: userId,
      actorRole: role,
      action: 'property_asset.update',
      entityType: 'PropertyAsset',
      entityId: updated.id,
      oldValue: row,
      newValue: updated,
    });

    res.json({ asset: updated });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'Custom alias must be unique' });
      return;
    }
    logger.error('[assets] updateProperty error', { err });
    res.status(500).json({ message: 'Failed to update property asset' });
  }
});

// Soft-delete property
assetsRouter.delete('/properties/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const actor = requireActor(req, res);
  if (!actor) return;

  const userId = actor.sub;
  const role = actor.role;

  try {
    const existing = await prisma.propertyAsset.findFirst({ where: { id, deletedAt: null }, select: { id: true, ownerId: true } });
    if (!existing) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    if (!canDeleteAsset(userId, role, existing.ownerId)) {
      res.status(403).json({ message: 'Insufficient permissions.' });
      return;
    }

    await prisma.propertyAsset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      actorId: userId,
      actorRole: role,
      action: 'property_asset.delete',
      entityType: 'PropertyAsset',
      entityId: id,
      oldValue: existing,
    });

    res.json({ message: 'Property asset deleted' });
  } catch (err) {
    logger.error('[assets] deleteProperty error', { err });
    res.status(500).json({ message: 'Failed to delete property asset' });
  }
});

// Valuations
assetsRouter.get('/properties/:id/valuations', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const items = await prisma.valuationEntry.findMany({
      where: { assetId },
      orderBy: { valuationDate: 'desc' },
    });

    res.json({ items });
  } catch (err) {
    logger.error('[assets] listValuations error', { err });
    res.status(500).json({ message: 'Failed to fetch valuations' });
  }
});

assetsRouter.post('/properties/:id/valuations', validate(createValuationEntryInputSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const body = req.body as CreateValuationEntryInput;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const entry = await prisma.valuationEntry.create({
      data: {
        assetId,
        valuationDate: new Date(body.valuationDate),
        valuationAmount: new Prisma.Decimal(body.valuationAmount),
        valuationMethod: body.valuationMethod,
        valuedBy: body.valuedBy ?? null,
        notes: body.notes ?? null,
      },
    });

    res.status(201).json({ item: entry });
  } catch (err) {
    logger.error('[assets] createValuation error', { err });
    res.status(500).json({ message: 'Failed to create valuation entry' });
  }
});

assetsRouter.patch('/properties/:id/valuations/:entryId', validate(updateValuationEntrySchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const entryId = req.params.entryId as string;
  const body = req.body as UpdateValuationEntryInput;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const existing = await prisma.valuationEntry.findFirst({ where: { id: entryId, assetId } });
    if (!existing) {
      res.status(404).json({ message: 'Valuation entry not found' });
      return;
    }

    const entry = await prisma.valuationEntry.update({
      where: { id: entryId },
      data: {
        ...(body.valuationDate !== undefined && { valuationDate: new Date(body.valuationDate) }),
        ...(body.valuationAmount !== undefined && { valuationAmount: new Prisma.Decimal(body.valuationAmount) }),
        ...(body.valuationMethod !== undefined && { valuationMethod: body.valuationMethod }),
        ...(body.valuedBy !== undefined && { valuedBy: body.valuedBy }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    res.json({ item: entry });
  } catch (err) {
    logger.error('[assets] updateValuation error', { err });
    res.status(500).json({ message: 'Failed to update valuation entry' });
  }
});

// Mortgages
assetsRouter.get('/properties/:id/mortgages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const items = await prisma.mortgageEntry.findMany({
      where: { assetId },
      orderBy: { startDate: 'desc' },
    });

    res.json({ items });
  } catch (err) {
    logger.error('[assets] listMortgages error', { err });
    res.status(500).json({ message: 'Failed to fetch mortgages' });
  }
});

assetsRouter.post('/properties/:id/mortgages', validate(createMortgageEntryInputSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const body = req.body as CreateMortgageEntryInput;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const entry = await prisma.mortgageEntry.create({
      data: {
        assetId,
        lender: body.lender,
        productName: body.productName ?? null,
        mortgageTypeId: body.mortgageTypeId,
        loanAmount: new Prisma.Decimal(body.loanAmount),
        interestRate: body.interestRate !== undefined ? new Prisma.Decimal(body.interestRate) : null,
        termYears: body.termYears ?? null,
        paymentStatusId: body.paymentStatusId,
        startDate: new Date(body.startDate),
        settledAt: body.settledAt ? new Date(body.settledAt) : null,
        notes: body.notes ?? null,
      },
    });

    res.status(201).json({ item: entry });
  } catch (err) {
    logger.error('[assets] createMortgage error', { err });
    res.status(500).json({ message: 'Failed to create mortgage entry' });
  }
});

assetsRouter.patch('/properties/:id/mortgages/:entryId', validate(updateMortgageEntrySchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const entryId = req.params.entryId as string;
  const body = req.body as UpdateMortgageEntryInput;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const existing = await prisma.mortgageEntry.findFirst({ where: { id: entryId, assetId } });
    if (!existing) {
      res.status(404).json({ message: 'Mortgage entry not found' });
      return;
    }

    const entry = await prisma.mortgageEntry.update({
      where: { id: entryId },
      data: {
        ...(body.lender !== undefined && { lender: body.lender }),
        ...(body.productName !== undefined && { productName: body.productName }),
        ...(body.mortgageTypeId !== undefined && { mortgageTypeId: body.mortgageTypeId }),
        ...(body.loanAmount !== undefined && { loanAmount: new Prisma.Decimal(body.loanAmount) }),
        ...(body.interestRate !== undefined && { interestRate: body.interestRate === null ? null : new Prisma.Decimal(body.interestRate) }),
        ...(body.termYears !== undefined && { termYears: body.termYears }),
        ...(body.paymentStatusId !== undefined && { paymentStatusId: body.paymentStatusId }),
        ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
        ...(body.settledAt !== undefined && { settledAt: body.settledAt ? new Date(body.settledAt) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    res.json({ item: entry });
  } catch (err) {
    logger.error('[assets] updateMortgage error', { err });
    res.status(500).json({ message: 'Failed to update mortgage entry' });
  }
});

// Shareholdings
assetsRouter.get('/properties/:id/shareholdings', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const items = await prisma.shareholdingEntry.findMany({
      where: { assetId },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ items });
  } catch (err) {
    logger.error('[assets] listShareholdings error', { err });
    res.status(500).json({ message: 'Failed to fetch shareholdings' });
  }
});

assetsRouter.post('/properties/:id/shareholdings', validate(createShareholdingEntryInputSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const body = req.body as CreateShareholdingEntryInput;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.shareholdingEntry.create({
        data: {
          assetId,
          shareholderName: body.shareholderName,
          ownershipPercent: new Prisma.Decimal(body.ownershipPercent),
          profitPercent: new Prisma.Decimal(body.profitPercent),
          notes: body.notes ?? null,
        },
      });

      const total = await tx.shareholdingEntry.aggregate({
        where: { assetId },
        _sum: { ownershipPercent: true },
      });

      const totalOwnership = Number(total._sum.ownershipPercent ?? 0);
      if (totalOwnership > 100) {
        throw new Error('OWNERSHIP_OVER_100');
      }

      return created;
    });

    res.status(201).json({ item: entry });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'OWNERSHIP_OVER_100') {
      res.status(400).json({ message: 'Total ownershipPercent cannot exceed 100' });
      return;
    }
    logger.error('[assets] createShareholding error', { err });
    res.status(500).json({ message: 'Failed to create shareholding entry' });
  }
});

assetsRouter.patch('/properties/:id/shareholdings/:entryId', validate(updateShareholdingEntrySchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const entryId = req.params.entryId as string;
  const body = req.body as UpdateShareholdingEntryInput;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const existing = await prisma.shareholdingEntry.findFirst({ where: { id: entryId, assetId } });
    if (!existing) {
      res.status(404).json({ message: 'Shareholding entry not found' });
      return;
    }

    const entry = await prisma.$transaction(async (tx) => {
      const updated = await tx.shareholdingEntry.update({
        where: { id: entryId },
        data: {
          ...(body.shareholderName !== undefined && { shareholderName: body.shareholderName }),
          ...(body.ownershipPercent !== undefined && { ownershipPercent: new Prisma.Decimal(body.ownershipPercent) }),
          ...(body.profitPercent !== undefined && { profitPercent: new Prisma.Decimal(body.profitPercent) }),
          ...(body.notes !== undefined && { notes: body.notes }),
        },
      });

      const total = await tx.shareholdingEntry.aggregate({
        where: { assetId },
        _sum: { ownershipPercent: true },
      });

      const totalOwnership = Number(total._sum.ownershipPercent ?? 0);
      if (totalOwnership > 100) {
        throw new Error('OWNERSHIP_OVER_100');
      }

      return updated;
    });

    res.json({ item: entry });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'OWNERSHIP_OVER_100') {
      res.status(400).json({ message: 'Total ownershipPercent cannot exceed 100' });
      return;
    }
    logger.error('[assets] updateShareholding error', { err });
    res.status(500).json({ message: 'Failed to update shareholding entry' });
  }
});

// Transactions
assetsRouter.get('/properties/:id/transactions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
  const limit = Math.min(Number(req.query['limit']) || 20, 100);

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const rows = await prisma.transactionEntry.findMany({
      where: { assetId },
      orderBy: { date: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
  } catch (err) {
    logger.error('[assets] listTransactions error', { err });
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

assetsRouter.post('/properties/:id/transactions', validate(createTransactionEntryInputSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const body = req.body as CreateTransactionEntryInput;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const entry = await prisma.transactionEntry.create({
      data: {
        assetId,
        date: new Date(body.date),
        description: body.description,
        amount: new Prisma.Decimal(body.amount),
        categoryId: body.categoryId,
      },
    });

    res.status(201).json({ item: entry });
  } catch (err) {
    logger.error('[assets] createTransaction error', { err });
    res.status(500).json({ message: 'Failed to create transaction entry' });
  }
});

assetsRouter.patch('/properties/:id/transactions/:entryId', validate(updateTransactionEntrySchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const assetId = req.params.id as string;
  const entryId = req.params.entryId as string;
  const body = req.body as UpdateTransactionEntryInput;

  try {
    const asset = await findAccessibleAsset(assetId, req);
    if (!asset) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const existing = await prisma.transactionEntry.findFirst({ where: { id: entryId, assetId } });
    if (!existing) {
      res.status(404).json({ message: 'Transaction entry not found' });
      return;
    }

    const entry = await prisma.transactionEntry.update({
      where: { id: entryId },
      data: {
        ...(body.date !== undefined && { date: new Date(body.date) }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.amount !== undefined && { amount: new Prisma.Decimal(body.amount) }),
        ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
      },
    });

    res.json({ item: entry });
  } catch (err) {
    logger.error('[assets] updateTransaction error', { err });
    res.status(500).json({ message: 'Failed to update transaction entry' });
  }
});
