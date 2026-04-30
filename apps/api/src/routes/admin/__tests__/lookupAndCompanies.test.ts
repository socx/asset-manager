import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    lookupItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    company: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue('1'),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../../../lib/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../lib/jwt', () => ({
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  verifyAccessToken: jest.fn(),
  refreshExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
  REFRESH_COOKIE_NAME: 'refresh_token',
  REFRESH_COOKIE_OPTIONS: {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    maxAge: 604800000,
    path: '/api/v1/auth',
  },
}));

// ── Mock references ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    lookupItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      aggregate: jest.Mock;
    };
    company: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis: mockRedis } = jest.requireMock('../../../lib/redis') as {
  redis: { get: jest.Mock };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'admin-uuid-1',
    email: 'admin@example.com',
    role: 'system_admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

const ADMIN_AUTH = 'Bearer valid-admin-token';

const MOCK_LOOKUP_ITEM = {
  id: 'item-uuid-1',
  type: 'document_type',
  name: 'Valuation',
  description: null,
  sortOrder: 1,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_COMPANY = {
  id: 'company-uuid-1',
  name: 'Acme Ltd',
  companyType: { id: 'type-uuid-1', name: 'Supplier' },
  addressLine1: '1 Main St',
  addressLine2: null,
  city: 'London',
  county: null,
  postCode: 'EC1A 1BB',
  country: 'UK',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Admin Lookup Items API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeAdminPayload());
    mockRedis.get.mockResolvedValue('1');
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  describe('Auth guards', () => {
    it('401 GET /admin/lookup/:type — no token', async () => {
      await request(app).get('/api/v1/admin/lookup/document_type').expect(401);
    });

    it('403 GET /admin/lookup/:type — non-admin role', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'asset_owner' }));
      await request(app)
        .get('/api/v1/admin/lookup/document_type')
        .set('Authorization', ADMIN_AUTH)
        .expect(403);
    });

    it('403 — step-up required', async () => {
      mockRedis.get.mockResolvedValue(null);
      await request(app)
        .get('/api/v1/admin/lookup/document_type')
        .set('Authorization', ADMIN_AUTH)
        .expect(403);
    });
  });

  // ── GET /admin/lookup/:type ──────────────────────────────────────────────────

  describe('GET /api/v1/admin/lookup/:type', () => {
    it('200 — returns items ordered by sortOrder', async () => {
      mockPrisma.lookupItem.findMany.mockResolvedValue([MOCK_LOOKUP_ITEM]);
      const res = await request(app)
        .get('/api/v1/admin/lookup/document_type')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);
      expect((res.body as { items: unknown[] }).items).toHaveLength(1);
    });

    it('400 — unknown lookup type', async () => {
      await request(app)
        .get('/api/v1/admin/lookup/unknown_type')
        .set('Authorization', ADMIN_AUTH)
        .expect(400);
    });
  });

  // ── POST /admin/lookup/:type ─────────────────────────────────────────────────

  describe('POST /api/v1/admin/lookup/:type', () => {
    it('201 — creates item with auto sort order', async () => {
      mockPrisma.lookupItem.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
      mockPrisma.lookupItem.create.mockResolvedValue({ ...MOCK_LOOKUP_ITEM, sortOrder: 6 });

      const res = await request(app)
        .post('/api/v1/admin/lookup/document_type')
        .set('Authorization', ADMIN_AUTH)
        .send({ name: 'New Type' })
        .expect(201);

      expect((res.body as { item: { name: string } }).item.name).toBe('Valuation');
    });

    it('201 — creates item with explicit sort order', async () => {
      mockPrisma.lookupItem.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
      mockPrisma.lookupItem.create.mockResolvedValue({ ...MOCK_LOOKUP_ITEM, sortOrder: 3 });

      await request(app)
        .post('/api/v1/admin/lookup/document_type')
        .set('Authorization', ADMIN_AUTH)
        .send({ name: 'New Type', sortOrder: 3 })
        .expect(201);
    });

    it('400 — missing name', async () => {
      await request(app)
        .post('/api/v1/admin/lookup/document_type')
        .set('Authorization', ADMIN_AUTH)
        .send({ description: 'no name' })
        .expect(400);
    });

    it('400 — unknown type', async () => {
      await request(app)
        .post('/api/v1/admin/lookup/bad_type')
        .set('Authorization', ADMIN_AUTH)
        .send({ name: 'X' })
        .expect(400);
    });
  });

  // ── PATCH /admin/lookup-items/:id ────────────────────────────────────────────

  describe('PATCH /api/v1/admin/lookup-items/:id', () => {
    it('200 — updates name', async () => {
      mockPrisma.lookupItem.findUnique.mockResolvedValue(MOCK_LOOKUP_ITEM);
      mockPrisma.lookupItem.update.mockResolvedValue({ ...MOCK_LOOKUP_ITEM, name: 'Updated' });

      const res = await request(app)
        .patch('/api/v1/admin/lookup-items/item-uuid-1')
        .set('Authorization', ADMIN_AUTH)
        .send({ name: 'Updated' })
        .expect(200);

      expect((res.body as { item: { name: string } }).item.name).toBe('Updated');
    });

    it('404 — item not found', async () => {
      mockPrisma.lookupItem.findUnique.mockResolvedValue(null);
      await request(app)
        .patch('/api/v1/admin/lookup-items/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .send({ name: 'X' })
        .expect(404);
    });

    it('200 — can deactivate item', async () => {
      mockPrisma.lookupItem.findUnique.mockResolvedValue(MOCK_LOOKUP_ITEM);
      mockPrisma.lookupItem.update.mockResolvedValue({ ...MOCK_LOOKUP_ITEM, isActive: false });

      const res = await request(app)
        .patch('/api/v1/admin/lookup-items/item-uuid-1')
        .set('Authorization', ADMIN_AUTH)
        .send({ isActive: false })
        .expect(200);

      expect((res.body as { item: { isActive: boolean } }).item.isActive).toBe(false);
    });
  });

  // ── DELETE /admin/lookup-items/:id ───────────────────────────────────────────

  describe('DELETE /api/v1/admin/lookup-items/:id', () => {
    it('200 — deletes unreferenced item', async () => {
      mockPrisma.lookupItem.findUnique.mockResolvedValue({
        ...MOCK_LOOKUP_ITEM,
        _count: { companies: 0 },
      });
      mockPrisma.lookupItem.delete.mockResolvedValue(MOCK_LOOKUP_ITEM);

      await request(app)
        .delete('/api/v1/admin/lookup-items/item-uuid-1')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);
    });

    it('409 — blocks deletion when referenced by companies', async () => {
      mockPrisma.lookupItem.findUnique.mockResolvedValue({
        ...MOCK_LOOKUP_ITEM,
        _count: { companies: 2 },
      });

      await request(app)
        .delete('/api/v1/admin/lookup-items/item-uuid-1')
        .set('Authorization', ADMIN_AUTH)
        .expect(409);
    });

    it('404 — item not found', async () => {
      mockPrisma.lookupItem.findUnique.mockResolvedValue(null);
      await request(app)
        .delete('/api/v1/admin/lookup-items/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .expect(404);
    });
  });
});

// ── Public lookup endpoint ────────────────────────────────────────────────────

describe('Public Lookup API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'asset_owner' }));
  });

  it('200 GET /api/v1/lookup/:type — any auth role can access', async () => {
    mockPrisma.lookupItem.findMany.mockResolvedValue([MOCK_LOOKUP_ITEM]);
    const res = await request(app)
      .get('/api/v1/lookup/document_type')
      .set('Authorization', ADMIN_AUTH)
      .expect(200);
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('401 GET /api/v1/lookup/:type — no token', async () => {
    await request(app).get('/api/v1/lookup/document_type').expect(401);
  });

  it('400 GET /api/v1/lookup/:type — unknown type', async () => {
    await request(app)
      .get('/api/v1/lookup/bad_type')
      .set('Authorization', ADMIN_AUTH)
      .expect(400);
  });
});

// ── Admin Companies API ───────────────────────────────────────────────────────

describe('Admin Companies API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeAdminPayload());
    mockRedis.get.mockResolvedValue('1');
  });

  describe('GET /api/v1/admin/companies', () => {
    it('200 — returns companies list', async () => {
      mockPrisma.company.findMany.mockResolvedValue([MOCK_COMPANY]);
      const res = await request(app)
        .get('/api/v1/admin/companies')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);
      expect((res.body as { companies: unknown[] }).companies).toHaveLength(1);
    });

    it('200 — supports search', async () => {
      mockPrisma.company.findMany.mockResolvedValue([MOCK_COMPANY]);
      await request(app)
        .get('/api/v1/admin/companies?search=Acme')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);
      expect(mockPrisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ name: { contains: 'Acme', mode: 'insensitive' } }),
        }),
      );
    });
  });

  describe('POST /api/v1/admin/companies', () => {
    it('201 — creates company', async () => {
      mockPrisma.company.create.mockResolvedValue(MOCK_COMPANY);
      const res = await request(app)
        .post('/api/v1/admin/companies')
        .set('Authorization', ADMIN_AUTH)
        .send({ name: 'Acme Ltd' })
        .expect(201);
      expect((res.body as { company: { name: string } }).company.name).toBe('Acme Ltd');
    });

    it('400 — missing name', async () => {
      await request(app)
        .post('/api/v1/admin/companies')
        .set('Authorization', ADMIN_AUTH)
        .send({ city: 'London' })
        .expect(400);
    });
  });

  describe('GET /api/v1/admin/companies/:id', () => {
    it('200 — returns company', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(MOCK_COMPANY);
      const res = await request(app)
        .get('/api/v1/admin/companies/company-uuid-1')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);
      expect((res.body as { company: { id: string } }).company.id).toBe('company-uuid-1');
    });

    it('404 — company not found', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      await request(app)
        .get('/api/v1/admin/companies/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/admin/companies/:id', () => {
    it('200 — updates company', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(MOCK_COMPANY);
      mockPrisma.company.update.mockResolvedValue({ ...MOCK_COMPANY, name: 'Updated Ltd' });

      const res = await request(app)
        .patch('/api/v1/admin/companies/company-uuid-1')
        .set('Authorization', ADMIN_AUTH)
        .send({ name: 'Updated Ltd' })
        .expect(200);

      expect((res.body as { company: { name: string } }).company.name).toBe('Updated Ltd');
    });

    it('404 — company not found', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      await request(app)
        .patch('/api/v1/admin/companies/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/admin/companies/:id', () => {
    it('200 — soft-deletes company', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(MOCK_COMPANY);
      mockPrisma.company.update.mockResolvedValue({ ...MOCK_COMPANY, isActive: false, deletedAt: new Date() });

      const res = await request(app)
        .delete('/api/v1/admin/companies/company-uuid-1')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect((res.body as { message: string }).message).toMatch(/deactivated/i);
    });

    it('404 — company not found', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      await request(app)
        .delete('/api/v1/admin/companies/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .expect(404);
    });
  });
});

// ── Public Companies API ──────────────────────────────────────────────────────

describe('Public Companies API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'asset_owner' }));
  });

  it('200 GET /api/v1/companies — any auth role can access', async () => {
    mockPrisma.company.findMany.mockResolvedValue([MOCK_COMPANY]);
    const res = await request(app)
      .get('/api/v1/companies')
      .set('Authorization', ADMIN_AUTH)
      .expect(200);
    expect((res.body as { companies: unknown[] }).companies).toHaveLength(1);
  });

  it('401 GET /api/v1/companies — no token', async () => {
    await request(app).get('/api/v1/companies').expect(401);
  });

  it('200 GET /api/v1/companies?q= — supports typeahead search', async () => {
    mockPrisma.company.findMany.mockResolvedValue([MOCK_COMPANY]);
    await request(app)
      .get('/api/v1/companies?q=Acme')
      .set('Authorization', ADMIN_AUTH)
      .expect(200);
    expect(mockPrisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: { contains: 'Acme', mode: 'insensitive' } }),
      }),
    );
  });
});
