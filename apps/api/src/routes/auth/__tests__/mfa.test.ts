import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────
// IMPORTANT: jest.mock() factories are hoisted before variable declarations,
// so all mock state must be defined *inside* the factory then retrieved via jest.requireMock().

jest.mock('@asset-manager/db', () => ({
  prisma: {
    user: { findFirst: jest.fn(), update: jest.fn() },
    mfaBackupCode: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    userSession: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../lib/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
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

jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('MOCKSECRET'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/mock'),
  verify: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

// ── Mock references ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    user: { findFirst: jest.Mock; update: jest.Mock };
    mfaBackupCode: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    userSession: { create: jest.Mock };
    $transaction: jest.Mock;
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis: mockRedis } = jest.requireMock('../../../lib/redis') as {
  redis: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyAccessToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateSecret: mockGenerateSecret, generateURI: mockGenerateURI, verify: mockTotpVerify } = jest.requireMock('otplib') as {
  generateSecret: jest.Mock;
  generateURI: jest.Mock;
  verify: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUTH_HEADER = 'Bearer valid-token';

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

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-uuid-1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    role: 'asset_owner',
    status: 'active',
    mfaEnabled: false,
    mfaSecret: null,
    ...overrides,
  };
}

function setAuthUser(overrides: Record<string, unknown> = {}) {
  mockVerifyAccessToken.mockReturnValue(makeTokenPayload(overrides));
}

// ── POST /api/v1/auth/mfa/setup ───────────────────────────────────────────────

describe('POST /api/v1/auth/mfa/setup', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.mfaBackupCode.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.mfaBackupCode.createMany.mockResolvedValue({ count: 8 });
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  });

  it('401 — missing Authorization header', async () => {
    const res = await request(app).post('/api/v1/auth/mfa/setup');
    expect(res.status).toBe(401);
  });

  it('401 — invalid token', async () => {
    mockVerifyAccessToken.mockImplementation(() => { throw new Error('Invalid'); });
    const res = await request(app).post('/api/v1/auth/mfa/setup').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(401);
  });

  it('404 — user not found in DB', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/auth/mfa/setup').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('409 — MFA already enabled', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaEnabled: true }));
    const res = await request(app).post('/api/v1/auth/mfa/setup').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already enabled/i);
  });

  it('200 — returns secret, qrCodeDataUrl, and 8 backup codes', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser());
    mockGenerateSecret.mockReturnValue('ABCDEFGHIJ234567');
    mockGenerateURI.mockReturnValue('otpauth://totp/mock');

    const res = await request(app).post('/api/v1/auth/mfa/setup').set('Authorization', AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('secret', 'ABCDEFGHIJ234567');
    expect(res.body).toHaveProperty('qrCodeDataUrl');
    expect(res.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(Array.isArray(res.body.backupCodes)).toBe(true);
    expect(res.body.backupCodes).toHaveLength(8);
    // Each code should be a 10-char uppercase hex string
    for (const code of res.body.backupCodes as string[]) {
      expect(code).toMatch(/^[A-F0-9]{10}$/);
    }
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ── POST /api/v1/auth/mfa/confirm ─────────────────────────────────────────────

describe('POST /api/v1/auth/mfa/confirm', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
  });

  it('401 — missing Authorization header', async () => {
    const res = await request(app).post('/api/v1/auth/mfa/confirm').send({ totpCode: '123456' });
    expect(res.status).toBe(401);
  });

  it('400 — totpCode missing from body', async () => {
    setAuthUser();
    const res = await request(app)
      .post('/api/v1/auth/mfa/confirm')
      .set('Authorization', AUTH_HEADER)
      .send({});
    expect(res.status).toBe(400);
  });

  it('400 — totpCode wrong length (schema validation)', async () => {
    setAuthUser();
    const res = await request(app)
      .post('/api/v1/auth/mfa/confirm')
      .set('Authorization', AUTH_HEADER)
      .send({ totpCode: '12345' }); // 5 digits instead of 6
    expect(res.status).toBe(400);
  });

  it('400 — setup not initiated (no mfaSecret)', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaSecret: null }));
    const res = await request(app)
      .post('/api/v1/auth/mfa/confirm')
      .set('Authorization', AUTH_HEADER)
      .send({ totpCode: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/setup not initiated/i);
  });

  it('409 — MFA already enabled', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaEnabled: true, mfaSecret: 'SECRET' }));
    const res = await request(app)
      .post('/api/v1/auth/mfa/confirm')
      .set('Authorization', AUTH_HEADER)
      .send({ totpCode: '123456' });
    expect(res.status).toBe(409);
  });

  it('400 — invalid TOTP code', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaSecret: 'MOCKSECRET' }));
    mockTotpVerify.mockResolvedValue({ valid: false });
    const res = await request(app)
      .post('/api/v1/auth/mfa/confirm')
      .set('Authorization', AUTH_HEADER)
      .send({ totpCode: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid totp/i);
  });

  it('200 — valid TOTP enables MFA', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaSecret: 'MOCKSECRET' }));
    mockTotpVerify.mockResolvedValue({ valid: true });
    const res = await request(app)
      .post('/api/v1/auth/mfa/confirm')
      .set('Authorization', AUTH_HEADER)
      .send({ totpCode: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/enabled/i);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mfaEnabled: true }) }),
    );
  });
});

// ── POST /api/v1/auth/mfa/disable ────────────────────────────────────────────

describe('POST /api/v1/auth/mfa/disable', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.mfaBackupCode.deleteMany.mockResolvedValue({ count: 8 });
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  });

  it('401 — missing Authorization header', async () => {
    const res = await request(app).post('/api/v1/auth/mfa/disable').send({ totpCode: '123456' });
    expect(res.status).toBe(401);
  });

  it('400 — totpCode missing', async () => {
    setAuthUser();
    const res = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', AUTH_HEADER)
      .send({});
    expect(res.status).toBe(400);
  });

  it('400 — MFA not enabled on account', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaEnabled: false }));
    const res = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', AUTH_HEADER)
      .send({ totpCode: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enabled/i);
  });

  it('400 — invalid TOTP code', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaEnabled: true, mfaSecret: 'MOCKSECRET' }));
    mockTotpVerify.mockResolvedValue({ valid: false });
    const res = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', AUTH_HEADER)
      .send({ totpCode: '000000' });
    expect(res.status).toBe(400);
  });

  it('200 — valid TOTP disables MFA and clears backup codes', async () => {
    setAuthUser();
    mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaEnabled: true, mfaSecret: 'MOCKSECRET' }));
    mockTotpVerify.mockResolvedValue({ valid: true });
    const res = await request(app)
      .post('/api/v1/auth/mfa/disable')
      .set('Authorization', AUTH_HEADER)
      .send({ totpCode: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/disabled/i);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ── POST /api/v1/auth/mfa/verify ─────────────────────────────────────────────

describe('POST /api/v1/auth/mfa/verify', () => {
  let app: ReturnType<typeof createApp>;
  const CHALLENGE = 'a'.repeat(64);
  const CHALLENGE_DATA = JSON.stringify({ userId: 'user-uuid-1' });

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockResolvedValue(null);
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.mfaBackupCode.findFirst.mockResolvedValue(null);
    mockPrisma.mfaBackupCode.update.mockResolvedValue({});
    mockPrisma.userSession.create.mockResolvedValue({});
  });

  it('400 — missing sessionChallenge', async () => {
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ totpCode: '123456' });
    expect(res.status).toBe(400);
  });

  it('400 — missing both totpCode and backupCode', async () => {
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionChallenge: CHALLENGE });
    expect(res.status).toBe(400);
  });

  it('401 — challenge not found in Redis (expired or invalid)', async () => {
    mockRedis.get.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionChallenge: CHALLENGE, totpCode: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired or invalid/i);
  });

  it('401 — user not found for challenge userId', async () => {
    mockRedis.get.mockResolvedValue(CHALLENGE_DATA);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionChallenge: CHALLENGE, totpCode: '123456' });
    expect(res.status).toBe(401);
  });

  it('401 — invalid TOTP code', async () => {
    mockRedis.get.mockResolvedValue(CHALLENGE_DATA);
    mockPrisma.user.findFirst.mockResolvedValue(
      makeUser({ mfaEnabled: true, mfaSecret: 'MOCKSECRET' }),
    );
    mockTotpVerify.mockResolvedValue({ valid: false });
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionChallenge: CHALLENGE, totpCode: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid mfa code/i);
  });

  it('200 — valid TOTP issues access token and refresh cookie', async () => {
    mockRedis.get.mockResolvedValue(CHALLENGE_DATA);
    mockPrisma.user.findFirst.mockResolvedValue(
      makeUser({ mfaEnabled: true, mfaSecret: 'MOCKSECRET' }),
    );
    mockTotpVerify.mockResolvedValue({ valid: true });

    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionChallenge: CHALLENGE, totpCode: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'mock-access-token');
    expect(res.body.user).toMatchObject({ email: 'alice@example.com' });
    const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(setCookie).toBeDefined();
    const hasRefreshCookie = (setCookie ?? []).some((c) => c.startsWith('refresh_token='));
    expect(hasRefreshCookie).toBe(true);
    // Challenge must be deleted from Redis
    expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining(CHALLENGE));
    // Session must be persisted
    expect(mockPrisma.userSession.create).toHaveBeenCalledTimes(1);
  });

  it('401 — backup code already used (usedAt set)', async () => {
    mockRedis.get.mockResolvedValue(CHALLENGE_DATA);
    mockPrisma.user.findFirst.mockResolvedValue(
      makeUser({ mfaEnabled: true, mfaSecret: 'MOCKSECRET' }),
    );
    // Simulate no unused matching backup code found
    mockPrisma.mfaBackupCode.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionChallenge: CHALLENGE, backupCode: 'AABBCCDDEE' });
    expect(res.status).toBe(401);
  });

  it('200 — valid backup code issues access token and marks code used', async () => {
    mockRedis.get.mockResolvedValue(CHALLENGE_DATA);
    mockPrisma.user.findFirst.mockResolvedValue(
      makeUser({ mfaEnabled: true, mfaSecret: 'MOCKSECRET' }),
    );
    mockPrisma.mfaBackupCode.findFirst.mockResolvedValue({
      id: 'backup-code-uuid-1',
      userId: 'user-uuid-1',
      codeHash: 'any-hash',
      usedAt: null,
    });

    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionChallenge: CHALLENGE, backupCode: 'AABBCCDDEE' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'mock-access-token');
    expect(mockPrisma.mfaBackupCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
    );
  });

  it('401 — account not active blocks verify even with valid TOTP', async () => {
    mockRedis.get.mockResolvedValue(CHALLENGE_DATA);
    mockPrisma.user.findFirst.mockResolvedValue(
      makeUser({ status: 'disabled', mfaEnabled: true, mfaSecret: 'MOCKSECRET' }),
    );
    mockTotpVerify.mockResolvedValue({ valid: true });
    const res = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionChallenge: CHALLENGE, totpCode: '123456' });
    expect(res.status).toBe(401);
  });
});
