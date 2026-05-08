import request from 'supertest';
import { createApp } from '../../app';

jest.mock('@asset-manager/db', () => ({
  prisma: {
    document: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
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
      filename: 'doc.pdf',
      storageKey: 's3://bucket/doc.pdf',
      mimeType: 'application/pdf',
      size: 12345,
      uploadedBy: USER_ID,
      assetId: null,
      metadata: null,
      isPublic: false,
      createdAt: now,
    };

    (mockPrisma.document.create as jest.Mock).mockResolvedValue(created);

    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', 'Bearer valid-token')
      .send({ filename: 'doc.pdf', storageKey: 's3://bucket/doc.pdf', mimeType: 'application/pdf', size: 12345 })
      .expect(201);

    expect(res.body).toHaveProperty('document');
    expect(res.body.document).toMatchObject({ id: created.id, filename: created.filename });
  });
});
