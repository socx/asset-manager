import request from 'supertest';
import { createApp } from '../../app';

jest.mock('@asset-manager/db', () => ({
  prisma: {
    document: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyAccessToken } = jest.requireMock('../../lib/jwt');

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeTokenPayload(overrides = {}) {
  return {
    sub: USER_ID,
    email: 'user@example.com',
    role: 'asset_owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

describe('Documents API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload());
  });

  test('GET /api/v1/documents returns documents list', async () => {
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toHaveProperty('documents');
    expect(Array.isArray(res.body.documents)).toBe(true);
  });

  test('POST /api/v1/documents creates a document record', async () => {
    const now = new Date().toISOString();
    const created = {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      title: 'doc.pdf',
      fileName: 'doc.pdf',
      storagePath: 's3://bucket/doc.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 12345,
      ownerId: USER_ID,
      uploadedById: USER_ID,
      relatedAssetId: null,
      documentTypeId: null,
      description: null,
      metadata: null,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    (mockPrisma.document.create as jest.Mock).mockResolvedValue(created);

    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', 'Bearer valid-token')
      .send({ filename: 'doc.pdf', storageKey: 's3://bucket/doc.pdf', mimeType: 'application/pdf', size: 12345 })
      .expect(201);

    expect(res.body).toHaveProperty('document');
    expect(res.body.document).toMatchObject({ id: created.id, filename: created.fileName });
  });

  test('PATCH /api/v1/documents/:id unlinks document from asset', async () => {
    const now = new Date().toISOString();
    const existing = {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      title: 'doc.pdf',
      fileName: 'doc.pdf',
      storagePath: 's3://bucket/doc.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 12345,
      ownerId: USER_ID,
      uploadedById: USER_ID,
      relatedAssetId: 'asset-1',
      documentTypeId: null,
      description: null,
      metadata: null,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const updated = { ...existing, relatedAssetId: null };

    (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(existing);
    (mockPrisma.document.update as jest.Mock).mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/v1/documents/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
      .set('Authorization', 'Bearer valid-token')
      .send({ assetId: null })
      .expect(200);

    expect(res.body.document.assetId).toBeNull();
    expect(mockPrisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' },
      data: { relatedAssetId: null },
    }));
  });
});
