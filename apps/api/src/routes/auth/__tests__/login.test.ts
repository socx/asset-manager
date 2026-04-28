import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────
// IMPORTANT: jest.mock() factories are hoisted before variable declarations,
// so all mock state must be defined *inside* the factory then retrieved via jest.requireMock().

jest.mock('argon2', () => ({
  verify: jest.fn(),
  argon2id: 2,
}));

jest.mock('@asset-manager/db', () => ({
  prisma: {
    user: { findFirst: jest.fn(), update: jest.fn() },
    userSession: { create: jest.fn() },
  },
}));

jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../lib/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  },
}));

// Mock jwt so signAccessToken returns a predictable value
jest.mock('../../../lib/jwt', () => ({
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
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

// Retrieve mock references after jest.mock() factories have run
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    user: { findFirst: jest.Mock; update: jest.Mock };
    userSession: { create: jest.Mock };
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verify: mockArgon2Verify } = jest.requireMock('argon2') as { verify: jest.Mock };

// ── Helpers ───────────────────────────────────────────────────────────────────

const validBody = {
  email: 'alice@example.com',
  password: 'Str0ng!Passw0rd#',
};

function makeActiveUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-uuid-1',
    email: 'alice@example.com',
    passwordHash: '$argon2id$v=19$fake',
    firstName: 'Alice',
    lastName: 'Smith',
    role: 'asset_owner',
    status: 'active',
    mfaEnabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.userSession.create.mockResolvedValue({});
  });

  // ── Schema validation ─────────────────────────────────────────────────────

  it('400 — missing email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ password: 'pass' });
    expect(res.status).toBe(400);
  });

  it('400 — invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'pass' });
    expect(res.status).toBe(400);
  });

  it('400 — missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com' });
    expect(res.status).toBe(400);
  });

  // ── User not found ────────────────────────────────────────────────────────

  it('401 — unknown email returns invalid credentials', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app).post('/api/v1/auth/login').send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials.');
  });

  // ── Account locked ────────────────────────────────────────────────────────

  it('423 — locked account returns retryAfter', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(
      makeActiveUser({ lockedUntil: new Date(Date.now() + 60_000) }),
    );

    const res = await request(app).post('/api/v1/auth/login').send(validBody);
    expect(res.status).toBe(423);
    expect(res.body).toHaveProperty('retryAfter');
  });

  // ── Status checks ─────────────────────────────────────────────────────────

  it('403 — pending_verification returns EMAIL_NOT_VERIFIED code', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(
      makeActiveUser({ status: 'pending_verification', lockedUntil: null }),
    );

    const res = await request(app).post('/api/v1/auth/login').send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('403 — disabled account is rejected', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(
      makeActiveUser({ status: 'disabled', lockedUntil: null }),
    );

    const res = await request(app).post('/api/v1/auth/login').send(validBody);
    expect(res.status).toBe(403);
  });

  // ── Wrong password ────────────────────────────────────────────────────────

  it('401 — wrong password increments failedLoginAttempts', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeActiveUser({ failedLoginAttempts: 1 }));
    mockArgon2Verify.mockResolvedValue(false);

    const res = await request(app).post('/api/v1/auth/login').send(validBody);
    expect(res.status).toBe(401);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 2 }),
      }),
    );
  });

  it('423 — 5th failed attempt locks account', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeActiveUser({ failedLoginAttempts: 4 }));
    mockArgon2Verify.mockResolvedValue(false);

    const res = await request(app).post('/api/v1/auth/login').send(validBody);
    expect(res.status).toBe(423);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 5 }),
      }),
    );
  });

  // ── MFA gate ──────────────────────────────────────────────────────────────

  it('200 mfaRequired — MFA-enabled users receive a challenge', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeActiveUser({ mfaEnabled: true }));
    mockArgon2Verify.mockResolvedValue(true);

    const res = await request(app).post('/api/v1/auth/login').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body).toHaveProperty('sessionChallenge');
  });

  // ── Successful login ──────────────────────────────────────────────────────

  it('200 — valid credentials return accessToken and Set-Cookie', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeActiveUser());
    mockArgon2Verify.mockResolvedValue(true);

    const res = await request(app).post('/api/v1/auth/login').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'mock-access-token');
    expect(res.body.user).toMatchObject({ email: 'alice@example.com', role: 'asset_owner' });
    // HttpOnly cookie should be set
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(setCookie).toBeDefined();
    const hasRefreshCookie = (setCookie ?? []).some((c) => c.startsWith('refresh_token='));
    expect(hasRefreshCookie).toBe(true);
  });

  it('200 — successful login resets failedLoginAttempts to 0', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeActiveUser({ failedLoginAttempts: 2 }));
    mockArgon2Verify.mockResolvedValue(true);

    await request(app).post('/api/v1/auth/login').send(validBody);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 0 }),
      }),
    );
  });
});
