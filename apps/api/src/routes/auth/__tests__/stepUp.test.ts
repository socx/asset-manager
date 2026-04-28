import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('argon2', () => ({
  verify: jest.fn(),
  argon2id: 2,
}));

jest.mock('@asset-manager/db', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
  },
}));

jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() },
}));
jest.mock('../../../lib/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
  },
}));
jest.mock('../../../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  refreshExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
  REFRESH_COOKIE_NAME: 'refresh_token',
  REFRESH_COOKIE_OPTIONS: { httpOnly: true, secure: false, sameSite: 'strict', maxAge: 604800000, path: '/api/v1/auth' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: { user: { findFirst: jest.Mock } };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verify: mockArgon2Verify } = jest.requireMock('argon2') as { verify: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis: mockRedis } = jest.requireMock('../../../lib/redis') as { redis: { set: jest.Mock; get: jest.Mock } };

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'Bearer valid-token';

function makeTokenPayload(overrides: Record<string, unknown> = {}) {
  return { sub: 'user-uuid-1', email: 'alice@example.com', role: 'system_admin', iat: 0, exp: 9999999999, ...overrides };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return { id: 'user-uuid-1', passwordHash: '$argon2id$fake', status: 'active', ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/step-up', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeTokenPayload());
    // satisfy requireStepUp on admin routes — not needed here, but kept for consistency
    mockRedis.get.mockResolvedValue('1');
  });

  it('400 — missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/step-up')
      .set('Authorization', VALID_TOKEN)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  it('401 — user not found in DB', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockArgon2Verify.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/auth/step-up')
      .set('Authorization', VALID_TOKEN)
      .send({ password: 'AnyPassword1!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication failed/i);
  });

  it('401 — user found but status disabled', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ status: 'disabled' }));

    const res = await request(app)
      .post('/api/v1/auth/step-up')
      .set('Authorization', VALID_TOKEN)
      .send({ password: 'AnyPassword1!' });
    expect(res.status).toBe(401);
  });

  it('401 — wrong password', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser());
    mockArgon2Verify.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/auth/step-up')
      .set('Authorization', VALID_TOKEN)
      .send({ password: 'WrongPassword1!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication failed/i);
  });

  it('200 — correct password; stores step-up key in Redis', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeUser());
    mockArgon2Verify.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/step-up')
      .set('Authorization', VALID_TOKEN)
      .send({ password: 'CorrectPassword1!' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/successful/i);
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('step_up:'),
      '1',
      'EX',
      expect.any(Number),
    );
  });

  it('401 — unauthenticated request (no token)', async () => {
    const res = await request(app).post('/api/v1/auth/step-up').send({ password: 'X' });
    expect(res.status).toBe(401);
  });
});
