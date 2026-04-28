import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../../app';

// ── Helpers ───────────────────────────────────────────────────────────────────

const RAW_TOKEN = 'a'.repeat(64); // 64-char hex string
const TOKEN_HASH = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex');
const FUTURE = new Date(Date.now() + 60 * 60 * 1_000);
const PAST = new Date(Date.now() - 60 * 60 * 1_000);

const mockUser = { id: 'user-id-001', status: 'pending_verification', email: 'a@b.com', role: 'asset_owner' };

const mockRecord = {
  id: 'rec-001',
  tokenHash: TOKEN_HASH,
  usedAt: null,
  expiresAt: FUTURE,
  user: mockUser,
};

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    emailVerification: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue([]),
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));

const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    emailVerification: { findFirst: jest.Mock; update: jest.Mock };
    user: { update: jest.Mock };
    $transaction: jest.Mock;
    auditLog: { create: jest.Mock };
  };
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/verify-email', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.emailVerification.findFirst.mockResolvedValue({
      ...mockRecord,
      usedAt: null,
      expiresAt: FUTURE,
      user: { ...mockUser, status: 'pending_verification' },
    });
    mockPrisma.$transaction.mockResolvedValue([]);
  });

  it('returns 400 when token query param is missing', async () => {
    const res = await request(app).get('/api/v1/auth/verify-email');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing/i);
  });

  it('returns 400 for an unknown token', async () => {
    mockPrisma.emailVerification.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid|already been used/i);
  });

  it('returns 200 with already-verified message when token was already used', async () => {
    mockPrisma.emailVerification.findFirst.mockResolvedValue({
      ...mockRecord,
      usedAt: new Date(),
    });
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already been verified/i);
  });

  it('returns 200 with already-verified message when user is already active', async () => {
    mockPrisma.emailVerification.findFirst.mockResolvedValue({
      ...mockRecord,
      usedAt: null,
      user: { ...mockUser, status: 'active' },
    });
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already been verified/i);
  });

  it('returns 400 for an expired token', async () => {
    mockPrisma.emailVerification.findFirst.mockResolvedValue({
      ...mockRecord,
      expiresAt: PAST,
    });
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('returns 200 and activates the user for a valid token', async () => {
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verified successfully/i);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('hashes the raw token before querying the DB', async () => {
    await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    const callArg = mockPrisma.emailVerification.findFirst.mock.calls[0][0] as { where: { tokenHash: string } };
    expect(callArg.where.tokenHash).toBe(TOKEN_HASH);
    expect(callArg.where.tokenHash).not.toBe(RAW_TOKEN);
  });
});


// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/verify-email', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.emailVerification.findFirst.mockResolvedValue({
      ...mockRecord,
      usedAt: null,
      expiresAt: FUTURE,
      user: { ...mockUser, status: 'pending_verification' },
    });
    mockPrisma.$transaction.mockResolvedValue([]);
  });

  it('returns 400 when token query param is missing', async () => {
    const res = await request(app).get('/api/v1/auth/verify-email');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing/i);
  });

  it('returns 400 for an unknown token', async () => {
    mockPrisma.emailVerification.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid|already been used/i);
  });

  it('returns 200 with already-verified message when token was already used', async () => {
    mockPrisma.emailVerification.findFirst.mockResolvedValue({
      ...mockRecord,
      usedAt: new Date(),
    });
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already been verified/i);
  });

  it('returns 200 with already-verified message when user is already active', async () => {
    mockPrisma.emailVerification.findFirst.mockResolvedValue({
      ...mockRecord,
      usedAt: null,
      user: { ...mockUser, status: 'active' },
    });
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already been verified/i);
  });

  it('returns 400 for an expired token', async () => {
    mockPrisma.emailVerification.findFirst.mockResolvedValue({
      ...mockRecord,
      expiresAt: PAST,
    });
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('returns 200 and activates the user for a valid token', async () => {
    const res = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verified successfully/i);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('hashes the raw token before querying the DB', async () => {
    await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    const callArg = mockPrisma.emailVerification.findFirst.mock.calls[0][0] as { where: { tokenHash: string } };
    expect(callArg.where.tokenHash).toBe(TOKEN_HASH);
    expect(callArg.where.tokenHash).not.toBe(RAW_TOKEN);
  });
});
