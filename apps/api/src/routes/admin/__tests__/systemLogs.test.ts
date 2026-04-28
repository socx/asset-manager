import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    systemLog: { findMany: jest.fn() },
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
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() },
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
  redis: { get: jest.Mock };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: { systemLog: { findMany: jest.Mock } };
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
    level: 'info',
    service: 'api',
    message: 'Test log entry',
    context: null,
    traceId: 'trace-abc123',
    createdAt: new Date('2026-04-15T10:00:00Z'),
    ...overrides,
  };
}

const ADMIN_AUTH = 'Bearer valid-admin-token';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Admin System Logs API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeAdminPayload());
    mockRedis.get.mockResolvedValue('1');
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  describe('Auth & permission guards', () => {
    it('401 — no token', async () => {
      await request(app).get('/api/v1/admin/system-logs').expect(401);
    });

    it('403 — wrong role (asset_owner)', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'asset_owner' }));
      await request(app)
        .get('/api/v1/admin/system-logs')
        .set('Authorization', ADMIN_AUTH)
        .expect(403);
    });

    it('403 — step-up not completed', async () => {
      mockRedis.get.mockResolvedValue(null);
      await request(app)
        .get('/api/v1/admin/system-logs')
        .set('Authorization', ADMIN_AUTH)
        .expect(403)
        .expect((res) => {
          expect((res.body as { code: string }).code).toBe('STEP_UP_REQUIRED');
        });
    });
  });

  // ── GET /admin/system-logs ───────────────────────────────────────────────────

  describe('GET /api/v1/admin/system-logs', () => {
    it('200 — returns logs list and null nextCursor when under limit', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([
        makeLog(),
        makeLog({ id: BigInt('99'), level: 'warn' }),
      ]);

      const res = await request(app)
        .get('/api/v1/admin/system-logs')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      const body = res.body as { logs: Array<{ id: string; level: string }>; nextCursor: null };
      expect(body.logs).toHaveLength(2);
      expect(body.nextCursor).toBeNull();
      expect(typeof body.logs[0].id).toBe('string');
    });

    it('200 — returns nextCursor when more results exist', async () => {
      const rows = Array.from({ length: 51 }, (_, i) => makeLog({ id: BigInt(100 - i) }));
      mockPrisma.systemLog.findMany.mockResolvedValue(rows);

      const res = await request(app)
        .get('/api/v1/admin/system-logs?limit=50')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      const body = res.body as { logs: unknown[]; nextCursor: string };
      expect(body.logs).toHaveLength(50);
      expect(body.nextCursor).toBeTruthy();
    });

    it('200 — filters by level', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/system-logs?level=error')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ level: 'error' }),
        }),
      );
    });

    it('400 — invalid level value', async () => {
      await request(app)
        .get('/api/v1/admin/system-logs?level=verbose')
        .set('Authorization', ADMIN_AUTH)
        .expect(400);
    });

    it('200 — filters by traceId', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/system-logs?traceId=abc-123')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ traceId: 'abc-123' }),
        }),
      );
    });

    it('200 — filters by service', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/system-logs?service=api')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ service: 'api' }),
        }),
      );
    });

    it('200 — filters by date range', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/system-logs?dateFrom=2026-01-01&dateTo=2026-03-31')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('200 — passes cursor as id lt filter', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/system-logs?cursor=88')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.systemLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { lt: BigInt('88') } }),
        }),
      );
    });

    it('400 — invalid cursor', async () => {
      await request(app)
        .get('/api/v1/admin/system-logs?cursor=not-a-number')
        .set('Authorization', ADMIN_AUTH)
        .expect(400);
    });

    it('200 — response includes X-Trace-Id header', async () => {
      mockPrisma.systemLog.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/admin/system-logs')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(res.headers['x-trace-id']).toBeDefined();
    });
  });
});
