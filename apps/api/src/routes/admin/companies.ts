import type { Response } from 'express';
import { prisma } from '@asset-manager/db';
import { type CreateCompanyInput, type UpdateCompanyInput } from '@asset-manager/types';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

const COMPANY_SELECT = {
  id: true,
  name: true,
  companyType: { select: { id: true, name: true } },
  addressLine1: true,
  addressLine2: true,
  city: true,
  county: true,
  postCode: true,
  country: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function requireActor(req: AuthenticatedRequest, res: Response) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Authentication required.' });
    return null;
  }
  return user;
}

// ── List companies (paginated, searchable) ────────────────────────────────────

export async function listCompaniesAdminHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

  try {
    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: COMPANY_SELECT,
    });

    const hasMore = companies.length > limit;
    const data = hasMore ? companies.slice(0, limit) : companies;
    res.json({ companies: data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (err) {
    logger.error('[admin/companies] listCompanies error', { err });
    res.status(500).json({ message: 'Failed to fetch companies' });
  }
}

// ── Get company by ID ─────────────────────────────────────────────────────────

export async function getCompanyHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  try {
    const company = await prisma.company.findFirst({
      where: { id, deletedAt: null },
      select: COMPANY_SELECT,
    });
    if (!company) {
      res.status(404).json({ message: 'Company not found' });
      return;
    }
    res.json({ company });
  } catch (err) {
    logger.error('[admin/companies] getCompany error', { err });
    res.status(500).json({ message: 'Failed to fetch company' });
  }
}

// ── Create company ────────────────────────────────────────────────────────────

export async function createCompanyHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as CreateCompanyInput;
  const actor = requireActor(req, res);
  if (!actor) return;

  try {
    const company = await prisma.company.create({
      data: {
        name: body.name,
        companyTypeId: body.companyTypeId ?? null,
        addressLine1: body.addressLine1 ?? null,
        addressLine2: body.addressLine2 ?? null,
        city: body.city ?? null,
        county: body.county ?? null,
        postCode: body.postCode ?? null,
        country: body.country ?? null,
      },
      select: COMPANY_SELECT,
    });

    await createAuditLog({
      actorId: actor.sub,
      actorRole: actor.role,
      action: 'company.create',
      entityType: 'Company',
      entityId: company.id,
      newValue: company,
    });

    res.status(201).json({ company });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      res.status(409).json({ message: `A company named "${body.name}" already exists` });
      return;
    }
    logger.error('[admin/companies] createCompany error', { err });
    res.status(500).json({ message: 'Failed to create company' });
  }
}

// ── Update company ────────────────────────────────────────────────────────────

export async function updateCompanyHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = req.body as UpdateCompanyInput;
  const actor = requireActor(req, res);
  if (!actor) return;

  try {
    const existing = await prisma.company.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Company not found' });
      return;
    }

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.companyTypeId !== undefined && { companyTypeId: body.companyTypeId }),
        ...(body.addressLine1 !== undefined && { addressLine1: body.addressLine1 }),
        ...(body.addressLine2 !== undefined && { addressLine2: body.addressLine2 }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.county !== undefined && { county: body.county }),
        ...(body.postCode !== undefined && { postCode: body.postCode }),
        ...(body.country !== undefined && { country: body.country }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      select: COMPANY_SELECT,
    });

    await createAuditLog({
      actorId: actor.sub,
      actorRole: actor.role,
      action: 'company.update',
      entityType: 'Company',
      entityId: company.id,
      oldValue: existing,
      newValue: company,
    });

    res.json({ company });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      res.status(409).json({ message: `A company with that name already exists` });
      return;
    }
    logger.error('[admin/companies] updateCompany error', { err });
    res.status(500).json({ message: 'Failed to update company' });
  }
}

// ── Soft-delete company ───────────────────────────────────────────────────────

export async function deleteCompanyHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const actor = requireActor(req, res);
  if (!actor) return;

  try {
    const existing = await prisma.company.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ message: 'Company not found' });
      return;
    }

    // Soft-delete: set deletedAt + isActive = false
    await prisma.company.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await createAuditLog({
      actorId: actor.sub,
      actorRole: actor.role,
      action: 'company.delete',
      entityType: 'Company',
      entityId: id,
      oldValue: existing,
    });

    res.json({ message: 'Company deactivated' });
  } catch (err) {
    logger.error('[admin/companies] deleteCompany error', { err });
    res.status(500).json({ message: 'Failed to delete company' });
  }
}
