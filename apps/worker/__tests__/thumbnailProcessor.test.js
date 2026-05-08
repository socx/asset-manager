const fs = require('fs');
const path = require('path');

jest.mock('@asset-manager/db', () => ({
  prisma: {
    document: { update: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('sharp', () => {
  return jest.fn(() => ({
    resize: () => ({
      jpeg: () => ({
        toFile: (p) => {
          const fsLocal = require('fs');
          const pathLocal = require('path');
          fsLocal.mkdirSync(pathLocal.dirname(p), { recursive: true });
          fsLocal.writeFileSync(p, 'thumb');
          return Promise.resolve();
        },
        toBuffer: async () => Buffer.from('lqip'),
        blur: function () { return { toBuffer: async () => Buffer.from('lqip') }; },
      }),
      blur: () => ({
        jpeg: () => ({ toBuffer: async () => Buffer.from('lqip') }),
      }),
    }),
  }));
});

const { processThumbnailJob } = require('../src/thumbnailProcessor');
const { prisma } = require('@asset-manager/db');

describe('thumbnailProcessor', () => {
  const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'documents');
  const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbnails');

  beforeEach(() => {
    try { fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); } catch (e) {}
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }); } catch (e) {}
    jest.clearAllMocks();
  });

  it('generates thumbnail and updates document metadata', async () => {
    const original = '161234-original.png';
    const storageKey = `uploads/documents/${original}`;
    const filePath = path.join(process.cwd(), storageKey);
    fs.writeFileSync(filePath, 'image');

    const data = { documentId: 'doc-1', storageKey, filePath, mimeType: 'image/png' };

    await processThumbnailJob(data);

    const thumbFilename = `thumb-${original.replace(/\.[^.]+$/, '')}.jpg`;
    const thumbPath = path.join(THUMB_DIR, thumbFilename);

    expect(fs.existsSync(thumbPath)).toBe(true);
    expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 'doc-1' }, data: { metadata: { thumbnailKey: `uploads/documents/thumbnails/${thumbFilename}`, thumbnailLqip: expect.any(String) } } });
  });
});
