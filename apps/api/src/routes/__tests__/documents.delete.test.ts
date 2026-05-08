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

jest.mock('../../lib/storage', () => ({
  storageProvider: {
    deleteFile: jest.fn().mockResolvedValue(undefined),
  },
  LocalStorageProvider: class {}, // for instanceof checks
}));

jest.mock('../../lib/redis', () => ({
  redis: { on: jest.fn() },
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'job-1' }) })),
}));

import { prisma } from '@asset-manager/db';
import { verifyAccessToken } from '../../lib/jwt';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockVerifyAccessToken = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>;

const USER_ID = '11111111-1111-4111-1111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-2222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-3333-333333333333';

const mockUser = {
  sub: USER_ID,
  email: 'user@example.com',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe('Document DELETE endpoint', () => {
  let app: any;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    mockVerifyAccessToken.mockReturnValue(mockUser as any);
  });

  test('DELETE /api/v1/documents/:id soft-deletes document (owned by user)', async () => {
    const now = new Date().toISOString();
    const document = {
      id: DOCUMENT_ID,
      title: 'doc.pdf',
      fileName: 'doc.pdf',
      storagePath: '/path/to/doc.pdf',
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

    const updatedDoc = { ...document, deletedAt: now };

    (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(document);
    (mockPrisma.document.update as jest.Mock).mockResolvedValue(updatedDoc);

    const res = await request(app)
      .delete(`/api/v1/documents/${DOCUMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toHaveProperty('document');
    expect(res.body.document.id).toBe(DOCUMENT_ID);

    expect(mockPrisma.document.update).toHaveBeenCalledWith({
      where: { id: DOCUMENT_ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  test('DELETE /api/v1/documents/:id returns 403 if not owned by user', async () => {
    const now = new Date().toISOString();
    const document = {
      id: DOCUMENT_ID,
      title: 'doc.pdf',
      fileName: 'doc.pdf',
      storagePath: '/path/to/doc.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 12345,
      ownerId: OTHER_USER_ID, // Different owner
      uploadedById: OTHER_USER_ID,
      relatedAssetId: null,
      documentTypeId: null,
      description: null,
      metadata: null,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(document);

    const res = await request(app)
      .delete(`/api/v1/documents/${DOCUMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(403);

    expect(res.body.message).toContain('permission');
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  test('DELETE /api/v1/documents/:id returns 404 if document not found', async () => {
    (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/documents/${DOCUMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(404);

    expect(res.body.message).toContain('not found');
  });

  test('DELETE /api/v1/documents/:id returns 401 if not authenticated', async () => {
    const res = await request(app)
      .delete(`/api/v1/documents/${DOCUMENT_ID}`)
      .expect(401);

    expect(res.body.message).toContain('Authentication');
  });
});

describe('Document access control', () => {
  let app: any;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    mockVerifyAccessToken.mockReturnValue(mockUser as any);
  });

  test('GET /api/v1/documents/:id allows owner to view', async () => {
    const now = new Date().toISOString();
    const document = {
      id: DOCUMENT_ID,
      title: 'doc.pdf',
      fileName: 'doc.pdf',
      storagePath: '/path/to/doc.pdf',
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

    (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(document);

    const res = await request(app)
      .get(`/api/v1/documents/${DOCUMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toHaveProperty('document');
    expect(res.body.document.id).toBe(DOCUMENT_ID);
  });

  test('GET /api/v1/documents/:id allows anyone to view public document', async () => {
    const now = new Date().toISOString();
    const document = {
      id: DOCUMENT_ID,
      title: 'doc.pdf',
      fileName: 'doc.pdf',
      storagePath: '/path/to/doc.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 12345,
      ownerId: OTHER_USER_ID,
      uploadedById: OTHER_USER_ID,
      relatedAssetId: null,
      documentTypeId: null,
      description: null,
      metadata: null,
      isPublic: true, // Public document
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(document);

    const res = await request(app)
      .get(`/api/v1/documents/${DOCUMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toHaveProperty('document');
  });

  test('GET /api/v1/documents/:id returns 404 if not owner and not public', async () => {
    const now = new Date().toISOString();
    const document = {
      id: DOCUMENT_ID,
      title: 'doc.pdf',
      fileName: 'doc.pdf',
      storagePath: '/path/to/doc.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 12345,
      ownerId: OTHER_USER_ID,
      uploadedById: OTHER_USER_ID,
      relatedAssetId: null,
      documentTypeId: null,
      description: null,
      metadata: null,
      isPublic: false, // Not public
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(document);

    const res = await request(app)
      .get(`/api/v1/documents/${DOCUMENT_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(404);

    expect(res.body.message).toContain('not found');
  });
});
