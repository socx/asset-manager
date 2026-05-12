import { Router, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { prisma } from '@asset-manager/db';
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth';
import { logger } from '../lib/logger';
import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { storageProvider, LocalStorageProvider } from '../lib/storage';
import { requireDocumentViewAccess, requireDocumentModifyAccess } from '../lib/documentAccessControl';
import { validateFile, getAllowedMimeTypes } from '../lib/fileValidation';

export const documentsRouter = Router();
const documentModel = (prisma as any).document;

// All document routes require authentication for now
documentsRouter.use(requireAuth);

// --- File upload storage (in-memory for abstracted storage provider support)
// Temporary local directory for thumbnails
const THUMB_DIR = path.join(process.cwd(), 'uploads', 'documents', 'thumbnails');
try { fs.mkdirSync(THUMB_DIR, { recursive: true }); } catch { /* ignore */ }

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowedTypes = getAllowedMimeTypes();
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`));
  },
});

const DOCUMENT_INCLUDE = {
  uploadedByUser: { select: { id: true, firstName: true, lastName: true } },
  relatedAsset: { select: { id: true, code: true, customAlias: true } },
  documentType: { select: { id: true, name: true } },
} as const;

function toApiDocument(doc: any) {
  return {
    id: doc.id,
    title: doc.title,
    filename: doc.fileName,
    storageKey: doc.storagePath,
    mimeType: doc.mimeType,
    size: doc.fileSizeBytes,
    ownerId: doc.ownerId,
    uploadedBy: doc.uploadedByUser
      ? { id: doc.uploadedByUser.id, firstName: doc.uploadedByUser.firstName, lastName: doc.uploadedByUser.lastName }
      : null,
    assetId: doc.relatedAssetId,
    assetLabel: doc.relatedAsset ? (doc.relatedAsset.customAlias || doc.relatedAsset.code) : null,
    documentTypeId: doc.documentTypeId,
    documentTypeName: doc.documentType?.name ?? null,
    description: doc.description,
    metadata: doc.metadata,
    isPublic: doc.isPublic,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

// List documents (optional filter by assetId, search by title/type/uploader)
documentsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const actor = req.user;
  if (!actor) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const ADMIN_ROLES = new Set(['super_admin', 'system_admin']);
  const isAdmin = actor.role && ADMIN_ROLES.has(actor.role);

  const assetId = typeof req.query['assetId'] === 'string' ? req.query['assetId'] : undefined;
  const search = typeof req.query['search'] === 'string' ? req.query['search'].trim() : undefined;
  const documentTypeId = typeof req.query['documentTypeId'] === 'string' ? req.query['documentTypeId'] : undefined;
  const uploadedById = typeof req.query['uploadedById'] === 'string' ? req.query['uploadedById'] : undefined;
  const limit = Math.min(Number(req.query['limit']) || 20, 100);
  const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;

  // Non-admins can only see documents they own or uploaded (or public ones)
  const accessFilter = isAdmin ? {} : {
    OR: [
      { ownerId: actor.sub },
      { uploadedById: actor.sub },
      { isPublic: true },
    ],
  };

  const searchFilter = search
    ? { title: { contains: search, mode: 'insensitive' as const } }
    : {};

  try {
    const query = {
      where: {
        ...accessFilter,
        ...(assetId ? { relatedAssetId: assetId } : {}),
        ...(documentTypeId ? { documentTypeId } : {}),
        ...(uploadedById ? { uploadedById } : {}),
        ...searchFilter,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' as const },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    };

    let rows: Array<any>;
    try {
      rows = await documentModel.findMany({
        ...query,
        include: DOCUMENT_INCLUDE,
      });
    } catch (enrichedQueryError) {
      logger.warn('[documents] list fallback to base query', { err: enrichedQueryError });
      rows = await documentModel.findMany(query);
    }

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    res.json({ documents: items.map(toApiDocument), nextCursor: hasMore ? items[items.length - 1].id : null });
  } catch (err) {
    logger.error('[documents] list error', { err });
    res.status(500).json({ message: 'Failed to list documents' });
  }
});

// Get document metadata
documentsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const actor = req.user;
  if (!actor) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const id = String(req.params.id);

  if (!(await requireDocumentViewAccess(req, res, id))) {
    return;
  }

  try {
    const doc = await documentModel.findUnique({ where: { id }, include: DOCUMENT_INCLUDE });
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    res.json({ document: toApiDocument(doc) });
  } catch (err) {
    logger.error('[documents] get error', { err });
    res.status(500).json({ message: 'Failed to fetch document' });
  }
});

// Update document metadata (currently supports linking/unlinking asset)
documentsRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  if (!(await requireDocumentModifyAccess(req, res, id))) {
    return;
  }

  const body = req.body as { assetId?: string | null };
  if (!Object.prototype.hasOwnProperty.call(body, 'assetId')) {
    res.status(400).json({ message: 'No updatable fields provided' });
    return;
  }

  try {
    const existing = await documentModel.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    const updated = await documentModel.update({
      where: { id },
      data: {
        relatedAssetId: body.assetId ?? null,
      },
      include: DOCUMENT_INCLUDE,
    });

    res.json({ document: toApiDocument(updated) });
  } catch (err) {
    logger.error('[documents] patch error', { err });
    res.status(500).json({ message: 'Failed to update document' });
  }
});

// Create document metadata (storage handled separately)
// POST /documents (metadata-only) still supported
documentsRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const actor = req.user;
  if (!actor) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const body = req.body as {
    title?: string;
    filename?: string;
    storageKey?: string;
    mimeType?: string;
    size?: number;
    assetId?: string | null;
    documentTypeId?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
    isPublic?: boolean;
  };

  if (!body.filename || !body.storageKey || !body.mimeType || typeof body.size !== 'number') {
    res.status(400).json({ message: 'Missing required fields: filename, storageKey, mimeType, size' });
    return;
  }

  try {
    const created = await documentModel.create({
      data: {
        title: body.title ?? body.filename,
        fileName: body.filename,
        storagePath: body.storageKey,
        mimeType: body.mimeType,
        fileSizeBytes: body.size,
        ownerId: actor.sub ?? null,
        uploadedById: actor.sub ?? null,
        relatedAssetId: body.assetId ?? null,
        documentTypeId: body.documentTypeId ?? null,
        description: body.description ?? null,
        metadata: body.metadata as any,
        isPublic: body.isPublic ?? false,
      },
      include: DOCUMENT_INCLUDE,
    });

    res.status(201).json({ document: toApiDocument(created) });
  } catch (err) {
    logger.error('[documents] create error', { err });
    res.status(500).json({ message: 'Failed to create document record' });
  }
});

// Upload file and create document record in one step
// Thumbnail generation is enqueued to a background worker via Redis/BullMQ
const thumbnailQueue = new Queue('thumbnails', { connection: redis });

documentsRouter.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const actor = req.user;
  if (!actor) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const file = (req as any).file;
  const assetId = typeof req.body['assetId'] === 'string' ? req.body['assetId'] : null;
  const title = typeof req.body['title'] === 'string' ? req.body['title'].trim() : '';
  const description = typeof req.body['description'] === 'string' ? req.body['description'].trim() : null;
  const documentTypeId = typeof req.body['documentTypeId'] === 'string' ? req.body['documentTypeId'] : null;
  if (!file) {
    res.status(400).json({ message: 'File required' });
    return;
  }

  try {
    // Validate file magic bytes (in addition to MIME type from multer)
    validateFile(file.buffer, file.mimetype);

    // Upload file to storage provider
    const storagePath = await storageProvider.uploadFile(file.buffer, file.originalname);

    // Create DB record with storage path
    const created = await documentModel.create({
      data: {
        title: title || file.originalname,
        fileName: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        ownerId: actor.sub ?? null,
        uploadedById: actor.sub ?? null,
        relatedAssetId: assetId ?? null,
        description: description || null,
        documentTypeId: documentTypeId || null,
        metadata: undefined as any,
        isPublic: false,
      },
      include: DOCUMENT_INCLUDE,
    });

    // Enqueue thumbnail generation for image types — best-effort, don't block response
    try {
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        await thumbnailQueue.add('generate_thumbnail', {
          documentId: created.id,
          storageKey: storagePath,
          mimeType: file.mimetype,
          storageProvider: process.env.STORAGE_PROVIDER || 'local',
        });
      }
    } catch (qErr) {
      logger.error('[documents] failed to enqueue thumbnail job', { err: qErr });
    }

    res.status(201).json({ document: toApiDocument(created) });
  } catch (err) {
    logger.error('[documents] upload error', { err });
    const message = err instanceof Error ? err.message : 'Failed to store document';
    res.status(400).json({ message });
  }
});

// Serve file content for a document id (with access control)
// GET /documents/:id/file — serve/stream file or return pre-signed URL
documentsRouter.get('/:id/file', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  
  if (!(await requireDocumentViewAccess(req, res, id))) {
    return;
  }

  try {
    const doc = await documentModel.findUnique({ where: { id } });
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    // For local storage, serve file directly; for S3, fetch and stream
    if (storageProvider instanceof LocalStorageProvider) {
      const filePath = path.resolve(process.cwd(), doc.storagePath);
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', doc.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
        res.sendFile(filePath);
        return;
      }
    } else {
      // S3 or other provider - download and stream
      try {
        const buffer = await storageProvider.downloadFile(doc.storagePath);
        res.setHeader('Content-Type', doc.mimeType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
        res.send(buffer);
        return;
      } catch (err) {
        logger.error('[documents] failed to download from storage', { err });
      }
    }

    res.status(404).json({ message: 'File not found' });
  } catch (err) {
    logger.error('[documents] file get error', { err });
    res.status(500).json({ message: 'Failed to serve file' });
  }
});

// Legacy endpoint: `/raw` redirects to `/file` for backwards compatibility
documentsRouter.get('/:id/raw', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.redirect(307, `/api/v1/documents/${req.params.id}/file`);
});

// Serve thumbnail if available (generated by worker), otherwise fall back to raw
documentsRouter.get('/:id/thumbnail', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  
  if (!(await requireDocumentViewAccess(req, res, id))) {
    return;
  }

  try {
    const doc = await documentModel.findUnique({ where: { id } });
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    const thumbKey = (doc.metadata && (doc.metadata as any).thumbnailKey) as string | undefined;
    if (thumbKey) {
      const thumbPath = path.resolve(process.cwd(), thumbKey);
      if (fs.existsSync(thumbPath)) {
        res.sendFile(thumbPath);
        return;
      }
    }

    // Fallback to raw file when no thumbnail exists
    if (storageProvider instanceof LocalStorageProvider) {
      const filePath = path.resolve(process.cwd(), doc.storagePath);
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
        return;
      }
    } else {
      // S3 or other provider - download and stream
      try {
        const buffer = await storageProvider.downloadFile(doc.storagePath);
        res.setHeader('Content-Type', doc.mimeType);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
        return;
      } catch (err) {
        logger.error('[documents] failed to download from storage', { err });
      }
    }

    res.status(404).json({ message: 'File not found' });
  } catch (err) {
    logger.error('[documents] thumbnail get error', { err });
    res.status(500).json({ message: 'Failed to serve thumbnail' });
  }
});

// Delete document (soft delete with optional file cleanup)
documentsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  if (!(await requireDocumentModifyAccess(req, res, id))) {
    return;
  }

  try {
    const doc = await documentModel.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    // Soft delete: set deletedAt timestamp
    const updated = await documentModel.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Async cleanup of stored file (don't block response)
    setImmediate(async (): Promise<void> => {
      try {
        await storageProvider.deleteFile(doc.storagePath);
        // Also delete thumbnail if it exists
        if (doc.metadata && (doc.metadata as any).thumbnailKey) {
          const thumbKey = (doc.metadata as any).thumbnailKey;
          try {
            fs.unlinkSync(thumbKey);
          } catch {
            // ignore
          }
        }
      } catch (err) {
        logger.error('[documents] async file cleanup failed', { err, documentId: id });
      }
    });

    res.json({ document: toApiDocument(updated) });
  } catch (err) {
    logger.error('[documents] delete error', { err });
    res.status(500).json({ message: 'Failed to delete document' });
  }
});
