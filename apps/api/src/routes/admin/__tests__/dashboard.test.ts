import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    userSession: { findMany: jest.fn() },
    $queryRaw:   jest.fn(),
  },
}));

jest.mock('../../../lib/redis', () => ({
  redis: {
    get:   jest.fn(),
    zcount: jest.fn(),
    scan:  jest.fn(),
    set:   jest.fn().mockResolvedValue('OK'),
    del:   jest.fn().mockResolvedValue(1),
    // step-up check returns granted token by default
    // individual tests override as needed via mockRedis.get
  },
}));

jest.mock('../../../lib/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  refreshExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
  REFRESH_COOKIE_NAME: 'refresh_token',
  REFRESH_COOKIE_OPTIONS: { httpOnly: true, secure: false, sameSite: 'strict', maxAge: 604800000, path: '/api/v1/auth' },
}));

// ── Mock references ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: { userSession: { findMany: jest.Mock }; $queryRaw: jest.Mock };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis: mockRedis } = jest.requireMock('../../../lib/redis') as {
  redis: { get: jest.Mock; zcount: jest.Mock; scan: jest.Mock; set: jest.Mock; del: jest.Mock };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN = 'Bearer valid-token';

function makeTokenPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'admin-uuid-1', email: 'admin@example.com', role: 'system_admin',
    iat: 0, exp: 9999999999, ...overrides,
  };
}

// ── Active-users tests ────────────────────────────────────────────────────────

describe('GET /api/v1/admin/dashboard/active-users', () => {
  const app = createApp();

  beforeEach(() => {
    jest.resetAllMocks();
    mockVerifyToken.mockReturnValue(makeTokenPayload());
    // Step-up granted
    mockRedis.get.mockResolvedValue(`step_up:admin-uuid-1`);
    // Simulate 2 admin + 3 app online
    mockRedis.zcount
      .mockResolvedValueOnce(2)   // ADMIN_SET
      .mockResolvedValueOnce(3);  // APP_SET
    mockPrisma.userSession.findMany.mockResolvedValue([
      { createdAt: new Date() },
      { createdAt: new Date(Date.now() - 3600_000) },
    ]);
  });

  it('returns active-user counts and hourly activity', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard/active-users')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      adminOnline:     2,
      appOnline:       3,
      totalOnline:     5,
      hourlyActivity: expect.arrayContaining([
        expect.objectContaining({ hour: expect.any(String), sessions: expect.any(Number) }),
      ]),
      updatedAt: expect.any(String),
    });
    expect(res.body.hourlyActivity).toHaveLength(24);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard/active-users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin role', async () => {
    mockVerifyToken.mockReturnValue(makeTokenPayload({ role: 'asset_owner' }));
    const res = await request(app)
      .get('/api/v1/admin/dashboard/active-users')
      .set('Authorization', TOKEN);
    expect(res.status).toBe(403);
  });
});

// ── Page-activity tests ───────────────────────────────────────────────────────

describe('GET /api/v1/admin/dashboard/page-activity', () => {
  const app = createApp();

  beforeEach(() => {
    jest.resetAllMocks();
    mockVerifyToken.mockReturnValue(makeTokenPayload());
    // step-up check returns granted by default
    mockRedis.get.mockResolvedValue('step_up_granted');
    // Use key-based implementation for deterministic ordering
    mockRedis.zcount.mockImplementation((key: string) => {
      if (key === 'page_views:/admin') return Promise.resolve(3);
      if (key === 'page_views:/')      return Promise.resolve(1);
      return Promise.resolve(0);
    });
    mockPrisma.userSession.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
  });

  it('returns top pages sorted descending', async () => {
    mockRedis.scan
      .mockResolvedValueOnce(['0', ['page_views:/admin', 'page_views:/']])
      .mockResolvedValue(['0', []]);

    const res = await request(app)
      .get('/api/v1/admin/dashboard/page-activity')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.pages).toHaveLength(2);
    expect(res.body.pages[0]).toEqual({ path: '/admin', activeUsers: 3 });
    expect(res.body.pages[1]).toEqual({ path: '/',      activeUsers: 1 });
  });

  it('returns empty pages array when no activity', async () => {
    mockRedis.scan.mockResolvedValue(['0', []]);

    const res = await request(app)
      .get('/api/v1/admin/dashboard/page-activity')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.pages).toEqual([]);
  });
});

// ── Health tests ──────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/dashboard/health', () => {
  const app = createApp();

  beforeEach(() => {
    jest.resetAllMocks();
    mockVerifyToken.mockReturnValue(makeTokenPayload());
    mockRedis.get.mockResolvedValue('step_up_granted');
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('returns healthy status when DB and heartbeat are fine', async () => {
    const now = Date.now();
    // override get: first call is step-up, second is worker heartbeat
    mockRedis.get
      .mockResolvedValueOnce('step_up_granted')
      .mockResolvedValueOnce(String(now - 30_000)); // 30s ago — within 90s window

    const res = await request(app)
      .get('/api/v1/admin/dashboard/health')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.api.status).toBe('healthy');
    expect(res.body.db.status).toBe('healthy');
    expect(res.body.worker.status).toBe('healthy');
  });

  it('shows worker offline when heartbeat key is absent', async () => {
    mockRedis.get
      .mockResolvedValueOnce('step_up_granted')
      .mockResolvedValueOnce(null); // no heartbeat

    const res = await request(app)
      .get('/api/v1/admin/dashboard/health')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.worker.status).toBe('offline');
  });

  it('shows worker offline when heartbeat is older than 90s', async () => {
    const stale = Date.now() - 100_000; // 100s ago
    mockRedis.get
      .mockResolvedValueOnce('step_up_granted')
      .mockResolvedValueOnce(String(stale));

    const res = await request(app)
      .get('/api/v1/admin/dashboard/health')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.worker.status).toBe('offline');
  });

  it('shows db offline when prisma throws', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB down'));
    mockRedis.get
      .mockResolvedValueOnce('step_up_granted')
      .mockResolvedValueOnce(String(Date.now() - 10_000));

    const res = await request(app)
      .get('/api/v1/admin/dashboard/health')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.db.status).toBe('offline');
  });
});
