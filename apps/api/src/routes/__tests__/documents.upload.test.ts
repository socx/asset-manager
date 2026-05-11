import request from 'supertest';
import { createApp } from '../../app';

jest.mock('@asset-manager/db', () => ({
  prisma: {
    document: {
      create: jest.fn().mockResolvedValue({ id: 'd1' }),
    },
  },
}));

jest.mock('../../lib/jwt', () => ({
  verifyAccessToken: jest.fn().mockReturnValue({ sub: 'u1', role: 'asset_owner' }),
}));

describe('Documents upload endpoint', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts file upload', async () => {
    const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', validPdf, 'test.pdf')
      .expect(201);

    expect(res.body).toHaveProperty('document');
  });

  it('stores optional metadata fields from upload form', async () => {
    const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .field('title', 'Lease Agreement')
      .field('description', 'Signed lease for 2026')
      .field('documentTypeId', 'doc-type-1')
      .attach('file', validPdf, 'lease.pdf')
      .expect(201);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = jest.requireMock('@asset-manager/db');
    expect(prisma.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        title: 'Lease Agreement',
        description: 'Signed lease for 2026',
        documentTypeId: 'doc-type-1',
      }),
    }));
  });
});
