const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../../app');

jest.mock('@asset-manager/db', () => ({
  prisma: {
    document: { findUnique: jest.fn() },
  },
}));

jest.mock('../../lib/jwt', () => ({
  verifyAccessToken: jest.fn().mockReturnValue({ sub: 'u1', role: 'asset_owner' }),
}));

const { prisma } = require('@asset-manager/db');

describe('Documents thumbnail route', () => {
  const app = createApp();
  const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'documents');
  const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbnails');

  beforeEach(() => {
    try { fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(THUMB_DIR, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); } catch {}
    jest.clearAllMocks();
  });

  it('serves generated thumbnail when present', async () => {
    const thumbFilename = 'thumb-test.jpg';
    const thumbPath = path.join(THUMB_DIR, thumbFilename);
    fs.writeFileSync(thumbPath, 'THUMB');

    const storageKey = 'uploads/documents/test.png';
    const doc = { id: 'd1', storageKey, metadata: { thumbnailKey: `uploads/documents/thumbnails/${thumbFilename}` } };

    prisma.document.findUnique.mockResolvedValueOnce(doc);

    const res = await request(app)
      .get(`/api/v1/documents/${doc.id}/thumbnail`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(res.text).toBe('THUMB');
  });

  it('falls back to raw file when thumbnail missing', async () => {
    const storageKey = 'uploads/documents/test2.png';
    const rawPath = path.join(process.cwd(), storageKey);
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.writeFileSync(rawPath, 'RAW');

    const doc = { id: 'd2', storageKey, metadata: { thumbnailKey: 'uploads/documents/thumbnails/missing.jpg' } };

    prisma.document.findUnique.mockResolvedValueOnce(doc);

    const res = await request(app)
      .get(`/api/v1/documents/${doc.id}/thumbnail`)
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(res.text).toBe('RAW');
  });
});
