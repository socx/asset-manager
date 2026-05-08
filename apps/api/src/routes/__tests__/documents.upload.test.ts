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
  it('accepts file upload', async () => {
    const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', validPdf, 'test.pdf')
      .expect(201);

    expect(res.body).toHaveProperty('document');
  });
});
