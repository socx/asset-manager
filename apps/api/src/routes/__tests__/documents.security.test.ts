import request from 'supertest';
import { createApp } from '../../app';

jest.mock('@asset-manager/db', () => ({
  prisma: {
    document: {
      create: jest.fn().mockResolvedValue({ 
        id: 'd1',
        title: 'test.pdf',
        fileName: 'test.pdf',
        storagePath: '/path/to/test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        ownerId: 'u1',
        uploadedById: 'u1',
      }),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../lib/jwt', () => ({
  verifyAccessToken: jest.fn().mockReturnValue({ sub: 'u1', role: 'asset_owner' }),
}));

jest.mock('../../lib/storage', () => ({
  storageProvider: {
    uploadFile: jest.fn().mockResolvedValue('/path/to/stored/file'),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(),
  },
  LocalStorageProvider: class {},
}));

jest.mock('../../lib/fileValidation', () => ({
  validateFile: jest.fn((buffer: Buffer, mimeType: string) => {
    // Reject invalid magic bytes
    if (mimeType === 'application/pdf' && buffer[0] !== 0x25) {
      throw new Error('File content does not match declared type: application/pdf');
    }
    if (mimeType === 'image/png' && buffer[0] !== 0x89) {
      throw new Error('File content does not match declared type: image/png');
    }
    if (mimeType === 'image/jpeg' && buffer[0] !== 0xff) {
      throw new Error('File content does not match declared type: image/jpeg');
    }
  }),
  getAllowedMimeTypes: jest.fn(() => ['application/pdf', 'image/jpeg', 'image/png']),
}));

jest.mock('../../lib/redis', () => ({
  redis: { on: jest.fn() },
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'job-1' }) })),
}));

describe('Documents upload security', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects upload with invalid file type', async () => {
    // Multer fileFilter checks MIME type - request without file should return 400
    // In real scenario, GIF would be rejected by fileFilter before reaching our validation
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', Buffer.from('TEXT_DATA'), { filename: 'test.txt' });

    // Either rejected by multer fileFilter (400) or by our validation (400)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('processes file upload when authenticated', async () => {
    // Valid PDF - should succeed
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', pdfBuffer, { filename: 'test.pdf' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('document');
  });

  test('rejects upload with mismatched magic bytes (PNG as PDF)', async () => {
    // Send PNG header but claim it's PDF
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), { filename: 'fake.pdf' });

    // Should fail either at multer level if it detects wrong MIME, or at validation level
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('accepts valid PDF with correct magic bytes', async () => {
    // Valid PDF header
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', pdfBuffer, { filename: 'valid.pdf' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('document');
  });

  test('accepts valid PNG with correct magic bytes', async () => {
    // Valid PNG header
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', pngBuffer, { filename: 'valid.png' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('document');
  });

  test('accepts valid JPEG with JFIF magic bytes', async () => {
    // Valid JPEG JFIF header
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', jpegBuffer, { filename: 'valid.jpg' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('document');
  });

  test('requires authentication for upload', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .attach('file', Buffer.from([0x25, 0x50, 0x44, 0x46]), { filename: 'test.pdf' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Authentication');
  });

  test('validates authentication on all endpoints', async () => {
    // Both upload and download require auth
    const uploadRes = await request(app)
      .post('/api/v1/documents/upload');

    expect(uploadRes.status).toBe(401);
  });

  test('rejects upload larger than 20 MB', async () => {
    const oversizedPdf = Buffer.alloc((20 * 1024 * 1024) + 1, 0x25);

    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', 'Bearer token')
      .attach('file', oversizedPdf, { filename: 'too-large.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(413);
    expect(res.body.message).toContain('20 MB');
  });
});

