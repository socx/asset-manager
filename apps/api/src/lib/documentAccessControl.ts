/**
 * Document access control helpers
 * Enforces ownership and permission rules for document operations
 */
import { Response } from 'express';
import { type AuthenticatedRequest } from '../middleware/requireAuth';
import { prisma } from '@asset-manager/db';
import { logger } from './logger';

const ADMIN_ROLES = new Set(['super_admin', 'system_admin']);

export interface DocumentAccessContext {
  userId: string;
  documentId: string;
}

/**
 * Check if user can view a document.
 * Admins (super_admin / system_admin) can view any document.
 * Non-admins can view if they are the owner, the uploader, or the document is public.
 */
export async function canViewDocument(userId: string, documentId: string, userRole?: string): Promise<boolean> {
  if (userRole && ADMIN_ROLES.has(userRole)) return true;
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true, uploadedById: true, isPublic: true, deletedAt: true },
    });

    if (!doc || doc.deletedAt) return false;

    return doc.ownerId === userId || doc.uploadedById === userId || doc.isPublic === true;
  } catch (err) {
    logger.error('[access-control] canViewDocument error', { err, userId, documentId });
    return false;
  }
}

/**
 * Check if user can modify a document (delete, update).
 * Admins can modify any document.
 * Non-admins can modify if they are the owner or the uploader.
 */
export async function canModifyDocument(userId: string, documentId: string, userRole?: string): Promise<boolean> {
  if (userRole && ADMIN_ROLES.has(userRole)) return true;
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true, uploadedById: true, deletedAt: true },
    });

    if (!doc || doc.deletedAt) return false;

    return doc.ownerId === userId || doc.uploadedById === userId;
  } catch (err) {
    logger.error('[access-control] canModifyDocument error', { err, userId, documentId });
    return false;
  }
}

/**
 * Middleware helper to enforce document view access
 * Returns true if access granted, false otherwise
 * Sends 403 or 404 response if access denied
 */
export async function requireDocumentViewAccess(
  req: AuthenticatedRequest,
  res: Response,
  documentId: string
): Promise<boolean> {
  const actor = req.user;
  if (!actor) {
    res.status(401).json({ message: 'Authentication required.' });
    return false;
  }

  const canAccess = await canViewDocument(actor.sub, documentId, actor.role);
  if (!canAccess) {
    res.status(404).json({ message: 'Document not found' });
    return false;
  }

  return true;
}

/**
 * Middleware helper to enforce document modify access
 * Returns true if access granted, false otherwise
 * Sends 403 (forbidden) or 404 (not found) response if access denied
 */
export async function requireDocumentModifyAccess(
  req: AuthenticatedRequest,
  res: Response,
  documentId: string
): Promise<boolean> {
  const actor = req.user;
  if (!actor) {
    res.status(401).json({ message: 'Authentication required.' });
    return false;
  }

  // First check if document exists
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true, uploadedById: true, deletedAt: true },
    });

    if (!doc || doc.deletedAt) {
      res.status(404).json({ message: 'Document not found' });
      return false;
    }

    // Now check if user can modify (owns or uploaded the document, or is admin)
    if (doc.ownerId !== actor.sub && doc.uploadedById !== actor.sub && !(actor.role && ADMIN_ROLES.has(actor.role))) {
      res.status(403).json({ message: 'You do not have permission to modify this document' });
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[access-control] requireDocumentModifyAccess error', { err, documentId });
    res.status(500).json({ message: 'Failed to verify permissions' });
    return false;
  }
}
