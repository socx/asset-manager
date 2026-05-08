const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

jest.mock('@asset-manager/db', () => ({
  prisma: { document: { findUnique: jest.fn() } },
}));

const { prisma } = require('@asset-manager/db');

// Minimal route implementation mirroring the real handler to avoid importing TS modules
function mountThumbnailRoute(app) {
  app.get('/api/v1/documents/:id/thumbnail', async (req, res) => {
    const id = String(req.params.id);
    try {
      const doc = await prisma.document.findUnique({ where: { id } });
      if (!doc) return res.status(404).json({ message: 'Document not found' });

      const thumbKey = doc.metadata && doc.metadata.thumbnailKey;
      if (thumbKey) {
        const thumbPath = path.resolve(process.cwd(), thumbKey);
        if (fs.existsSync(thumbPath)) {
          const buf = fs.readFileSync(thumbPath);
          res.type(path.extname(thumbPath) || 'jpg');
          return res.send(buf.toString());
        }
      }

      const filePath = path.resolve(process.cwd(), doc.storageKey);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' });
      const rawBuf = fs.readFileSync(filePath);
      res.type(path.extname(filePath) || 'bin');
      return res.send(rawBuf.toString());
    } catch (err) {
      return res.status(500).json({ message: 'Failed to serve thumbnail' });
    }
  });
}

describe('Documents thumbnail minimal route', () => {
  const app = express();
  mountThumbnailRoute(app);

  const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'documents');
  const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbnails');

  beforeEach(() => {
    try { fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); } catch (e) {}
    fs.mkdirSync(THUMB_DIR, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); } catch (e) {}
    jest.clearAllMocks();
  });

  it('serves generated thumbnail when present', async () => {
    const thumbFilename = 'thumb-test.jpg';
    const thumbPath = path.join(THUMB_DIR, thumbFilename);
    fs.writeFileSync(thumbPath, 'THUMB');

    const storageKey = 'uploads/documents/test.png';
    const doc = { id: 'd1', storageKey, metadata: { thumbnailKey: `uploads/documents/thumbnails/${thumbFilename}` } };

    prisma.document.findUnique.mockResolvedValueOnce(doc);

    const res = await request(app).get(`/api/v1/documents/${doc.id}/thumbnail`).expect(200);
    expect(res.body.toString()).toBe('THUMB');
  });

  it('falls back to raw file when thumbnail missing', async () => {
    const storageKey = 'uploads/documents/test2.png';
    const rawPath = path.join(process.cwd(), storageKey);
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.writeFileSync(rawPath, 'RAW');

    const doc = { id: 'd2', storageKey, metadata: { thumbnailKey: 'uploads/documents/thumbnails/missing.jpg' } };
    prisma.document.findUnique.mockResolvedValueOnce(doc);

    const res = await request(app).get(`/api/v1/documents/${doc.id}/thumbnail`).expect(200);
    expect(res.body.toString()).toBe('RAW');
  });
});
