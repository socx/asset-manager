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

export const documentsRouter = Router();

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
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

function toApiDocument(doc: any) {
  return {
    id: doc.id,
    title: doc.title,
    filename: doc.fileName,
    storageKey: doc.storagePath,
    mimeType: doc.mimeType,
    size: doc.fileSizeBytes,
    ownerId: doc.ownerId,
    uploadedBy: doc.uploadedById,
    assetId: doc.relatedAssetId,
    documentTypeId: doc.documentTypeId,
    description: doc.description,
    metadata: doc.metadata,
    isPublic: doc.isPublic,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

// List documents (optional filter by assetId)
documentsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const actor = req.user;
  if (!actor) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }

  const assetId = typeof req.query['assetId'] === 'string' ? req.query['assetId'] : undefined;
  const limit = Math.min(Number(req.query['limit']) || 20, 100);
  const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;

  try {
    const rows = await prisma.document.findMany({
      where: { ...(assetId ? { relatedAssetId: assetId } : {}), deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

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
    const doc = await prisma.document.findUnique({ where: { id } });
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
    const created = await prisma.document.create({
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
  if (!file) {
    res.status(400).json({ message: 'File required' });
    return;
  }

  try {
    // Upload file to storage provider
    const storagePath = await storageProvider.uploadFile(file.buffer, file.originalname);

    // Create DB record with storage path
    const created = await prisma.document.create({
      data: {
        title: file.originalname,
        fileName: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        ownerId: actor.sub ?? null,
        uploadedById: actor.sub ?? null,
        relatedAssetId: assetId ?? null,
        metadata: undefined as any,
        isPublic: false,
      },
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
    res.status(500).json({ message: 'Failed to store document' });
  }
});

// Serve raw file content for a document id (with access control)
documentsRouter.get('/:id/raw', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  
  if (!(await requireDocumentViewAccess(req, res, id))) {
    return;
  }

  try {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    // For local storage, serve file directly; for S3, fetch and stream
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
    logger.error('[documents] raw get error', { err });
    res.status(500).json({ message: 'Failed to serve file' });
  }
});

// Serve thumbnail if available (generated by worker), otherwise fall back to raw
documentsRouter.get('/:id/thumbnail', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  
  if (!(await requireDocumentViewAccess(req, res, id))) {
    return;
  }

  try {
    const doc = await prisma.document.findUnique({ where: { id } });
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
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    // Soft delete: set deletedAt timestamp
    const updated = await prisma.document.update({
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
