import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    userSession: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../lib/jwt', () => ({
  signAccessToken: jest.fn().mockReturnValue('new-access-token'),
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    userSession: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      create?: jest.Mock;
      $transaction?: jest.Mock;
    };
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyAccessToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// Prisma.$transaction needs to be on the main prisma mock — we mock it at module level
// by patching the factory. But the refresh handler uses prisma.$transaction directly,
// so we need to intercept it. We add it dynamically here:
(mockPrisma as Record<string, unknown>)['$transaction'] = jest.fn();
const mockTransaction = (mockPrisma as Record<string, unknown>)['$transaction'] as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_REFRESH_TOKEN = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-uuid-1',
    userId: 'user-uuid-1',
    refreshTokenHash: 'any-hash',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date(),
    user: { id: 'user-uuid-1', email: 'alice@example.com', role: 'asset_owner', status: 'active' },
    ...overrides,
  };
}

function makeTokenPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'user-uuid-1',
    email: 'alice@example.com',
    role: 'asset_owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation(async (ops: unknown[]) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops);
      }
      return (ops as () => unknown)();
    });
  });

  it('401 — no cookie present', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('401 — unknown token hash (not in DB)', async () => {
    mockPrisma.userSession.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refresh_token=${VALID_REFRESH_TOKEN}`]);
    expect(res.status).toBe(401);
  });

  it('401 — already-revoked token triggers all-session revoke (replay detection)', async () => {
    mockPrisma.userSession.findFirst.mockResolvedValue(
      makeSession({ revokedAt: new Date(Date.now() - 1000) }),
    );
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 2 });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refresh_token=${VALID_REFRESH_TOKEN}`]);
    expect(res.status).toBe(401);
    expect(mockPrisma.userSession.updateMany).toHaveBeenCalled();
  });

  it('401 — expired session', async () => {
    mockPrisma.userSession.findFirst.mockResolvedValue(
      makeSession({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refresh_token=${VALID_REFRESH_TOKEN}`]);
    expect(res.status).toBe(401);
  });

  it('401 — inactive user account', async () => {
    mockPrisma.userSession.findFirst.mockResolvedValue(
      makeSession({ user: { id: 'u1', email: 'a@b.com', role: 'asset_owner', status: 'disabled' } }),
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refresh_token=${VALID_REFRESH_TOKEN}`]);
    expect(res.status).toBe(401);
  });

  it('200 — valid token returns new accessToken and rotates cookie', async () => {
    mockPrisma.userSession.findFirst.mockResolvedValue(makeSession());
    mockPrisma.userSession.update.mockResolvedValue({});
    mockPrisma.userSession.create = jest.fn().mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refresh_token=${VALID_REFRESH_TOKEN}`]);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'new-access-token');
    // Should set a new refresh cookie
    const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies).toBeDefined();
    const hasNewCookie = (cookies ?? []).some((c) => c.startsWith('refresh_token='));
    expect(hasNewCookie).toBe(true);
  });
});

// ── GET /api/v1/auth/sessions ─────────────────────────────────────────────────

describe('GET /api/v1/auth/sessions', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 — no Bearer token', async () => {
    const res = await request(app).get('/api/v1/auth/sessions');
    expect(res.status).toBe(401);
  });

  it('200 — returns active sessions for authenticated user', async () => {
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload());
    mockPrisma.userSession.findMany.mockResolvedValue([
      {
        id: 'session-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    ]);

    const res = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
  });
});

// ── DELETE /api/v1/auth/sessions/:sessionId ───────────────────────────────────

describe('DELETE /api/v1/auth/sessions/:sessionId', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 — no Bearer token', async () => {
    const res = await request(app).delete('/api/v1/auth/sessions/some-id');
    expect(res.status).toBe(401);
  });

  it('404 — session not owned by user', async () => {
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload());
    mockPrisma.userSession.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/auth/sessions/nonexistent-id')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
  });

  it('200 — revokes owned session', async () => {
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload());
    mockPrisma.userSession.findFirst.mockResolvedValue(makeSession({ id: 'target-session' }));
    mockPrisma.userSession.update.mockResolvedValue({});

    const res = await request(app)
      .delete('/api/v1/auth/sessions/target-session')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(mockPrisma.userSession.update).toHaveBeenCalled();
  });
});

// ── DELETE /api/v1/auth/sessions (all) ───────────────────────────────────────

describe('DELETE /api/v1/auth/sessions (all)', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 — no Bearer token', async () => {
    const res = await request(app).delete('/api/v1/auth/sessions');
    expect(res.status).toBe(401);
  });

  it('200 — revokes all sessions for authenticated user', async () => {
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload());
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 3 });

    const res = await request(app)
      .delete('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-uuid-1' }),
      }),
    );
  });
});
