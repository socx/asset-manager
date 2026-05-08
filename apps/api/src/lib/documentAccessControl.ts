/**
 * Document access control helpers
 * Enforces ownership and permission rules for document operations
 */
import { Response } from 'express';
import { type AuthenticatedRequest } from '../middleware/requireAuth';
import { prisma } from '@asset-manager/db';
import { logger } from './logger';

export interface DocumentAccessContext {
  userId: string;
  documentId: string;
}

/**
 * Check if user can view a document
 * - Owner can always view
 * - Public documents can be viewed by anyone
 */
export async function canViewDocument(userId: string, documentId: string): Promise<boolean> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true, isPublic: true, deletedAt: true },
    });

    if (!doc || doc.deletedAt) {
      return false; // Document not found or deleted
    }

    return doc.ownerId === userId || doc.isPublic === true;
  } catch (err) {
    logger.error('[access-control] canViewDocument error', { err, userId, documentId });
    return false;
  }
}

/**
 * Check if user can modify a document (delete, update)
 * - Only owner can modify
 */
export async function canModifyDocument(userId: string, documentId: string): Promise<boolean> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { ownerId: true, deletedAt: true },
    });

    if (!doc || doc.deletedAt) {
      return false; // Document not found or deleted
    }

    return doc.ownerId === userId;
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

  const canAccess = await canViewDocument(actor.sub, documentId);
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
      select: { ownerId: true, deletedAt: true },
    });

    if (!doc || doc.deletedAt) {
      res.status(404).json({ message: 'Document not found' });
      return false;
    }

    // Now check if user can modify (owns the document)
    if (doc.ownerId !== actor.sub) {
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
