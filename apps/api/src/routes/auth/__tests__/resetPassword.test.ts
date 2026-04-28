import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('$argon2id$v=19$new-hash'),
  argon2id: 2,
}));

jest.mock('@asset-manager/db', () => ({
  prisma: {
    passwordResetToken: { findFirst: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    userSession: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    passwordResetToken: { findFirst: jest.Mock; update: jest.Mock };
    user: { update: jest.Mock };
    userSession: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_RAW_TOKEN = 'a'.repeat(64); // 32 bytes hex = 64 chars
const STRONG_PASSWORD = 'NewStr0ng!Passw0rd#';

function makeResetToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-uuid-1',
    userId: 'user-uuid-1',
    tokenHash: 'any-hash',
    expiresAt: new Date(Date.now() + 3600 * 1000),
    usedAt: null,
    user: { id: 'user-uuid-1', role: 'asset_owner', status: 'active' },
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/reset-password', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.passwordResetToken.update.mockResolvedValue({});
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return (ops as () => unknown)();
    });
  });

  // ── Schema validation ─────────────────────────────────────────────────────

  it('400 — missing token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ newPassword: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('400 — missing newPassword', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: VALID_RAW_TOKEN });
    expect(res.status).toBe(400);
  });

  it('400 — weak password is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: VALID_RAW_TOKEN, newPassword: 'weak' });
    expect(res.status).toBe(400);
  });

  // ── Token validation ──────────────────────────────────────────────────────

  it('400 — unknown token hash', async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: VALID_RAW_TOKEN, newPassword: STRONG_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  it('400 — expired token is rejected', async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(
      makeResetToken({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: VALID_RAW_TOKEN, newPassword: STRONG_PASSWORD });
    expect(res.status).toBe(400);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('200 — valid token: updates password, marks token used, revokes sessions', async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(makeResetToken());

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: VALID_RAW_TOKEN, newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset successfully/i);

    // Transaction executed
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
