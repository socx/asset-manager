import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    passwordResetToken: { updateMany: jest.fn(), create: jest.fn() },
  },
}));

jest.mock('../../../lib/email', () => ({ queueEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../env', () => ({
  env: {
    NODE_ENV: 'test',
    APP_BASE_URL: 'http://localhost:5174',
    JWT_ACCESS_SECRET: 'test-secret-that-is-definitely-long-enough-32chars',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    user: { findFirst: jest.Mock };
    passwordResetToken: { updateMany: jest.Mock; create: jest.Mock };
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { queueEmail: mockQueueEmail } = jest.requireMock('../../../lib/email') as {
  queueEmail: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActiveUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-uuid-1',
    firstName: 'Alice',
    role: 'asset_owner',
    status: 'active',
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/forgot-password', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.passwordResetToken.create.mockResolvedValue({});
  });

  // ── Schema validation ─────────────────────────────────────────────────────

  it('400 — missing email field', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  it('400 — invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  // ── Anti-enumeration ──────────────────────────────────────────────────────

  it('200 — unknown email still returns generic success message', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/registered/i);
    expect(mockQueueEmail).not.toHaveBeenCalled();
  });

  it('200 — disabled user returns generic message without sending email', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeActiveUser({ status: 'disabled' }));

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'alice@example.com' });
    expect(res.status).toBe(200);
    expect(mockQueueEmail).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('200 — active user: invalidates old tokens, creates new token, queues email', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeActiveUser());

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();

    // Existing unused tokens invalidated
    expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-uuid-1', usedAt: null }),
      }),
    );

    // New token stored
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-uuid-1' }),
      }),
    );

    // Email queued
    expect(mockQueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reset_password', to: 'alice@example.com' }),
    );
  });
});
