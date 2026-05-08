import request from 'supertest';
import path from 'path';
import fs from 'fs';
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
    const filePath = path.join(__dirname, '..', '__fixtures__', 'test.pdf');
    // ensure fixture exists
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'PDF-DATA');

    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', filePath)
      .expect(201);

    expect(res.body).toHaveProperty('document');
  });
});
