import { Router, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { prisma } from '@asset-manager/db';
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth';
import { logger } from '../lib/logger';
import sharp from 'sharp';
import { type Request } from 'express';

export const documentsRouter = Router();

// All document routes require authentication for now
documentsRouter.use(requireAuth);

// --- File upload storage (development local storage)
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'documents');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbnails');
try { fs.mkdirSync(THUMB_DIR, { recursive: true }); } catch { /* ignore */ }

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, UPLOAD_DIR),
  filename: (_req: any, file: any, cb: any) => {
    const safe = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

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
      where: { ...(assetId ? { assetId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    res.json({ documents: items, nextCursor: hasMore ? items[items.length - 1].id : null });
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
  try {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    res.json({ document: doc });
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
    filename?: string;
    storageKey?: string;
    mimeType?: string;
    size?: number;
    assetId?: string | null;
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
        filename: body.filename,
        storageKey: body.storageKey,
        mimeType: body.mimeType,
        size: body.size,
        uploadedBy: actor.sub ?? null,
        assetId: body.assetId ?? null,
        metadata: body.metadata as any,
        isPublic: body.isPublic ?? false,
      },
    });

    res.status(201).json({ document: created });
  } catch (err) {
    logger.error('[documents] create error', { err });
    res.status(500).json({ message: 'Failed to create document record' });
  }
});

// Upload file and create document record in one step
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
    const storageKey = `uploads/documents/${file.filename}`;

    // generate thumbnail for image types
    let metadata: Record<string, unknown> | undefined = undefined;
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      try {
        const thumbFilename = `thumb-${file.filename.replace(/\.[^.]+$/, '')}.jpg`;
        const thumbPath = path.join(THUMB_DIR, thumbFilename);
        await sharp((file as any).path).resize({ width: 600 }).jpeg({ quality: 80 }).toFile(thumbPath);
        metadata = { thumbnailKey: `uploads/documents/thumbnails/${thumbFilename}` };
      } catch (thumbErr) {
        logger.error('[documents] thumbnail generation failed', { err: thumbErr });
        metadata = undefined;
      }
    }

    const created = await prisma.document.create({
      data: {
        filename: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: actor.sub ?? null,
        assetId: assetId ?? null,
        metadata: metadata as any,
        isPublic: false,
      },
    });

    res.status(201).json({ document: created });
  } catch (err) {
    logger.error('[documents] upload error', { err });
    res.status(500).json({ message: 'Failed to store document' });
  }
});

// Serve raw file content for a document id (development convenience)
documentsRouter.get('/:id/raw', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  try {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    const filePath = path.resolve(process.cwd(), doc.storageKey);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    res.sendFile(filePath);
  } catch (err) {
    logger.error('[documents] raw get error', { err });
    res.status(500).json({ message: 'Failed to serve file' });
  }
});
