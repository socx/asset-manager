import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    auditLog: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue('1'), // step-up granted
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

jest.mock('../../../lib/settings', () => ({
  getSetting: jest.fn().mockResolvedValue('5'),
  getBoolSetting: jest.fn().mockResolvedValue(true),
  getNumSetting: jest.fn().mockResolvedValue(5),
  setSetting: jest.fn().mockResolvedValue(undefined),
  seedDefaultSettings: jest.fn().mockResolvedValue(undefined),
  ALL_SETTING_KEYS: [],
  SETTING_DEFINITIONS: {},
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
const { verifyAccessToken: mockVerifyToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis: mockRedis } = jest.requireMock('../../../lib/redis') as {
  redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: { auditLog: { findMany: jest.Mock } };
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

function makeLog(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt('100'),
    actorId: 'actor-uuid-1',
    actorRole: 'super_admin',
    action: 'USER_LOGIN_SUCCESS',
    entityType: 'user',
    entityId: 'user-uuid-1',
    oldValue: null,
    newValue: null,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date('2026-03-15T10:00:00Z'),
    ...overrides,
  };
}

const ADMIN_AUTH = 'Bearer valid-admin-token';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Admin Audit Logs API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeAdminPayload());
    mockRedis.get.mockResolvedValue('1');
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  describe('Auth & permission guards', () => {
    it('401 — no token', async () => {
      await request(app).get('/api/v1/admin/audit-logs').expect(401);
    });

    it('403 — wrong role (asset_owner)', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'asset_owner' }));
      await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', ADMIN_AUTH)
        .expect(403);
    });

    it('403 — step-up not completed', async () => {
      mockRedis.get.mockResolvedValue(null);
      await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', ADMIN_AUTH)
        .expect(403)
        .expect((res) => {
          expect((res.body as { code: string }).code).toBe('STEP_UP_REQUIRED');
        });
    });
  });

  // ── GET /admin/audit-logs ────────────────────────────────────────────────────

  describe('GET /api/v1/admin/audit-logs', () => {
    it('200 — returns logs list and null nextCursor when under limit', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([makeLog(), makeLog({ id: BigInt('99') })]);

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      const body = res.body as { logs: Array<{ id: string }>; nextCursor: null };
      expect(body.logs).toHaveLength(2);
      expect(body.nextCursor).toBeNull();
      // ids must be serialised as strings
      expect(typeof body.logs[0].id).toBe('string');
    });

    it('200 — returns nextCursor when there are more results', async () => {
      // Return limit+1 rows to trigger hasMore
      const rows = Array.from({ length: 51 }, (_, i) =>
        makeLog({ id: BigInt(100 - i) }),
      );
      mockPrisma.auditLog.findMany.mockResolvedValue(rows);

      const res = await request(app)
        .get('/api/v1/admin/audit-logs?limit=50')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      const body = res.body as { logs: unknown[]; nextCursor: string };
      expect(body.logs).toHaveLength(50);
      expect(body.nextCursor).toBe('51'); // id of last item (100 - 49)
    });

    it('200 — filters by action', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/audit-logs?action=USER_LOGIN_FAILED')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'USER_LOGIN_FAILED' }),
        }),
      );
    });

    it('200 — filters by entityType and entityId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/audit-logs?entityType=user&entityId=some-uuid')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: 'user', entityId: 'some-uuid' }),
        }),
      );
    });

    it('200 — filters by actorId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/audit-logs?actorId=actor-uuid-1')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ actorId: 'actor-uuid-1' }),
        }),
      );
    });

    it('200 — filters by dateFrom and dateTo', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/audit-logs?dateFrom=2026-01-01&dateTo=2026-03-31')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('200 — passes cursor as id lt filter', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/audit-logs?cursor=99')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { lt: BigInt('99') } }),
        }),
      );
    });

    it('400 — invalid cursor string', async () => {
      await request(app)
        .get('/api/v1/admin/audit-logs?cursor=not-a-number')
        .set('Authorization', ADMIN_AUTH)
        .expect(400);
    });

    it('200 — accessible by both system_admin and super_admin', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'super_admin' }));

      await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);
    });
  });
});
