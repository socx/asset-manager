import request from 'supertest';
import { createApp } from '../../app';

jest.mock('@asset-manager/db', () => ({
  prisma: {
    document: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../lib/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    sub: 'u1',
    role: 'asset_owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })),
}));

jest.mock('../../lib/storage', () => ({
  storageProvider: {
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(),
  },
  LocalStorageProvider: class {},
}));

jest.mock('../../lib/redis', () => ({
  redis: { on: jest.fn() },
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'job-1' }) })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { storageProvider } = jest.requireMock('../../lib/storage');

describe('Documents file endpoint', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/v1/documents/:id/file streams file when access is allowed', async () => {
    const doc = {
      id: 'd1',
      title: 'test.pdf',
      fileName: 'test.pdf',
      storagePath: '/opaque/storage/key',
      mimeType: 'application/pdf',
      fileSizeBytes: 3,
      ownerId: 'u1',
      uploadedById: 'u1',
      relatedAssetId: null,
      documentTypeId: null,
      description: null,
      metadata: null,
      isPublic: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    (mockPrisma.document.findUnique as jest.Mock)
      .mockResolvedValueOnce(doc)
      .mockResolvedValueOnce(doc);
    (storageProvider.downloadFile as jest.Mock).mockResolvedValue(Buffer.from('pdf'));

    const res = await request(app)
      .get('/api/v1/documents/d1/file')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('filename="test.pdf"');
    expect(storageProvider.downloadFile).toHaveBeenCalledWith('/opaque/storage/key');
  });

  test('GET /api/v1/documents/:id/file requires authentication', async () => {
    const res = await request(app)
      .get('/api/v1/documents/d1/file')
      .expect(401);

    expect(res.body.message).toContain('Authentication');
  });
});
