import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    userSession: { updateMany: jest.fn() },
  },
}));

jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../lib/jwt', () => ({
  signAccessToken: jest.fn().mockReturnValue('access-token'),
  verifyAccessToken: jest.fn(),
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
    userSession: { updateMany: jest.Mock };
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerify } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_REFRESH_TOKEN = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222';

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

// ── Test suite ────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
  });

  it('401 — no Bearer token returns 401', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });

  it('200 — authenticated user with refresh cookie revokes session', async () => {
    mockVerify.mockReturnValue(makeTokenPayload());

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer valid-token')
      .set('Cookie', [`refresh_token=${VALID_REFRESH_TOKEN}`]);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully.');
    expect(mockPrisma.userSession.updateMany).toHaveBeenCalled();
  });

  it('200 — authenticated user without refresh cookie still succeeds', async () => {
    mockVerify.mockReturnValue(makeTokenPayload());

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully.');
    // updateMany should NOT be called when there's no cookie to hash
    expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled();
  });

  it('200 — response clears the refresh_token cookie', async () => {
    mockVerify.mockReturnValue(makeTokenPayload());

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer valid-token')
      .set('Cookie', [`refresh_token=${VALID_REFRESH_TOKEN}`]);

    const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
    // Cookie should be cleared (Max-Age=0 or Expires in the past)
    const cleared = (cookies ?? []).some(
      (c) => c.startsWith('refresh_token=') && (c.includes('Max-Age=0') || c.includes('Expires=')),
    );
    expect(cleared).toBe(true);
  });
});
