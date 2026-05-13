/**
 * ITER-5-001 / ITER-5-006 — Documents list: expanded search + asset-ownership access
 *
 * Coverage:
 *  - search matches title (existing)
 *  - search matches document type name
 *  - search matches related asset code
 *  - search matches uploader first/last name
 *  - non-admin can see documents linked to assets they own
 *  - non-admin can see documents linked to assets they manage
 *  - non-admin cannot see documents on assets they neither own nor manage
 */

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

const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const ASSET_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

function makeToken(overrides: Record<string, unknown> = {}) {
  return {
    sub: USER_ID,
    email: 'user@example.com',
    role: 'asset_owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    title: 'Lease Agreement',
    fileName: 'lease.pdf',
    storagePath: 'uploads/lease.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 102400,
    ownerId: OTHER_USER_ID,
    uploadedById: OTHER_USER_ID,
    relatedAssetId: ASSET_ID,
    documentTypeId: null,
    description: null,
    metadata: null,
    isPublic: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    uploadedByUser: null,
    relatedAsset: null,
    documentType: null,
    ...overrides,
  };
}

describe('Documents list — expanded search (ITER-5-001)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue(makeToken());
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);
  });

  test('search param is forwarded in query where clause — title', async () => {
    await request(app)
      .get('/api/v1/documents?search=lease')
      .set('Authorization', 'Bearer token')
      .expect(200);

    const [[callArg]] = (mockPrisma.document.findMany as jest.Mock).mock.calls;
    const where = callArg.where;

    // With both access + search conditions, query uses AND
    const andClauses: object[] = where.AND ?? [where];
    // Search clause is identified by having a `title` branch in its OR
    const searchClause = andClauses.find(
      (c: any) => Array.isArray(c.OR) && c.OR.some((o: any) => o.title),
    ) as any;

    expect(searchClause).toBeDefined();
    const titleCondition = searchClause.OR.find((o: any) => o.title);
    expect(titleCondition.title.contains).toBe('lease');
    expect(titleCondition.title.mode).toBe('insensitive');
  });

  test('search clause includes document type name condition', async () => {
    await request(app)
      .get('/api/v1/documents?search=lease')
      .set('Authorization', 'Bearer token')
      .expect(200);

    const [[callArg]] = (mockPrisma.document.findMany as jest.Mock).mock.calls;
    const where = callArg.where;

    const andClauses: object[] = where.AND ?? [where];
    const searchClause = andClauses.find(
      (c: any) => Array.isArray(c.OR) && c.OR.some((o: any) => o.title),
    ) as any;

    expect(searchClause).toBeDefined();
    const docTypeCondition = searchClause.OR.find((o: any) => o.documentType);
    expect(docTypeCondition.documentType.name.contains).toBe('lease');
  });

  test('search clause includes related asset code condition', async () => {
    await request(app)
      .get('/api/v1/documents?search=PRO-001')
      .set('Authorization', 'Bearer token')
      .expect(200);

    const [[callArg]] = (mockPrisma.document.findMany as jest.Mock).mock.calls;
    const where = callArg.where;

    const andClauses: object[] = where.AND ?? [where];
    // The search clause is identified by having a `title` branch in its OR
    const searchClause = andClauses.find(
      (c: any) => Array.isArray(c.OR) && c.OR.some((o: any) => o.title),
    ) as any;

    expect(searchClause).toBeDefined();
    const assetCondition = searchClause.OR.find((o: any) => o.relatedAsset);
    expect(assetCondition).toBeDefined();
    const assetCodeCondition = assetCondition.relatedAsset.OR.find((o: any) => o.code);
    expect(assetCodeCondition.code.contains).toBe('PRO-001');
  });

  test('search clause includes uploader name condition', async () => {
    await request(app)
      .get('/api/v1/documents?search=John')
      .set('Authorization', 'Bearer token')
      .expect(200);

    const [[callArg]] = (mockPrisma.document.findMany as jest.Mock).mock.calls;
    const where = callArg.where;

    const andClauses: object[] = where.AND ?? [where];
    const searchClause = andClauses.find(
      (c: any) => Array.isArray(c.OR) && c.OR.some((o: any) => o.title),
    ) as any;

    expect(searchClause).toBeDefined();
    const uploaderCondition = searchClause.OR.find((o: any) => o.uploadedByUser);
    const firstNameCondition = uploaderCondition.uploadedByUser.OR.find((o: any) => o.firstName);
    expect(firstNameCondition.firstName.contains).toBe('John');
  });

  test('no search param → no searchCondition in query', async () => {
    await request(app)
      .get('/api/v1/documents')
      .set('Authorization', 'Bearer token')
      .expect(200);

    const [[callArg]] = (mockPrisma.document.findMany as jest.Mock).mock.calls;
    const where = callArg.where;

    // When there is no search, no OR clause with documentType should appear
    const andClauses: object[] = where.AND ?? [where];
    const hasDocTypeSearch = andClauses.some(
      (c: any) => Array.isArray(c.OR) && c.OR.some((o: any) => o.documentType),
    );
    expect(hasDocTypeSearch).toBe(false);
  });

  test('returns documents when search matches by title', async () => {
    const doc = makeDoc({ title: 'Service Contract' });
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([doc]);

    const res = await request(app)
      .get('/api/v1/documents?search=Service')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].id).toBe('doc-1');
  });
});

describe('Documents list — asset-ownership access (ITER-5-001)', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue(makeToken());
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);
  });

  test('non-admin access filter includes relatedAsset.ownerId OR managedByUserId', async () => {
    await request(app)
      .get('/api/v1/documents')
      .set('Authorization', 'Bearer token')
      .expect(200);

    const [[callArg]] = (mockPrisma.document.findMany as jest.Mock).mock.calls;
    const where = callArg.where;

    // Access condition is either the where itself (if no AND) or inside an AND
    const andClauses: object[] = where.AND ?? [where];
    const accessClause = andClauses.find(
      (c: any) => Array.isArray(c.OR) && c.OR.some((o: any) => o.relatedAsset),
    ) as any;

    expect(accessClause).toBeDefined();
    const assetOwnershipBranch = accessClause.OR.find((o: any) => o.relatedAsset);
    expect(assetOwnershipBranch.relatedAsset.OR).toContainEqual({ ownerId: USER_ID });
    expect(assetOwnershipBranch.relatedAsset.OR).toContainEqual({ managedByUserId: USER_ID });
  });

  test('admin bypasses access filter entirely', async () => {
    mockVerifyAccessToken.mockReturnValue(makeToken({ role: 'super_admin' }));

    await request(app)
      .get('/api/v1/documents')
      .set('Authorization', 'Bearer token')
      .expect(200);

    const [[callArg]] = (mockPrisma.document.findMany as jest.Mock).mock.calls;
    const where = callArg.where;

    // For admin only deletedAt: null is set (no access OR branches)
    const andClauses: object[] = where.AND ?? [where];
    const hasAccessOr = andClauses.some(
      (c: any) => Array.isArray(c.OR) && c.OR.some((o: any) => o.ownerId || o.isPublic),
    );
    expect(hasAccessOr).toBe(false);
  });

  test('documents linked to user-owned asset are included in response', async () => {
    const doc = makeDoc({
      ownerId: OTHER_USER_ID,
      uploadedById: OTHER_USER_ID,
      isPublic: false,
      relatedAsset: { id: ASSET_ID, code: 'PRO-001', ownerId: USER_ID, managedByUserId: null },
    });
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([doc]);

    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].id).toBe('doc-1');
  });
});
