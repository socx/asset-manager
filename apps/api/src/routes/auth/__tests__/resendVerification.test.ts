import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    emailVerification: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockResolvedValue([]),
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('../../../lib/email', () => ({ queueEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));

const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    user: { findFirst: jest.Mock };
    emailVerification: { updateMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
    auditLog: { create: jest.Mock };
  };
};

const { queueEmail } = jest.requireMock('../../../lib/email') as { queueEmail: jest.Mock };

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockPendingUser = {
  id: 'user-id-001',
  email: 'bob@example.com',
  firstName: 'Bob',
  status: 'pending_verification',
  role: 'asset_owner',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/resend-verification', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue(mockPendingUser);
    mockPrisma.$transaction.mockResolvedValue([]);
  });

  it('returns 400 when body is missing email', async () => {
    const res = await request(app).post('/api/v1/auth/resend-verification').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with generic message when email not found (prevents enumeration)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'unknown@example.com' });
    expect(res.status).toBe(200);
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('returns 200 with already-verified message when user is active', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockPendingUser, status: 'active' });
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'bob@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already verified/i);
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('returns 200 and queues a new email for a pending_verification user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'bob@example.com' });
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'verify_email', to: 'bob@example.com' }),
    );
  });

  it('normalises email to lowercase before lookup', async () => {
    await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'BOB@EXAMPLE.COM' });
    const call = mockPrisma.user.findFirst.mock.calls[0][0] as {
      where: { email: { equals: string } };
    };
    expect(call.where.email.equals).toBe('bob@example.com');
  });

  it('returns 200 with generic message for a disabled user (no email queued)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockPendingUser, status: 'disabled' });
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'bob@example.com' });
    expect(res.status).toBe(200);
    expect(queueEmail).not.toHaveBeenCalled();
  });
});


// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/resend-verification', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue(mockPendingUser);
    mockPrisma.$transaction.mockResolvedValue([]);
  });

  it('returns 400 when body is missing email', async () => {
    const res = await request(app).post('/api/v1/auth/resend-verification').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with generic message when email not found (prevents enumeration)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'unknown@example.com' });
    expect(res.status).toBe(200);
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('returns 200 with already-verified message when user is active', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockPendingUser, status: 'active' });
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'bob@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already verified/i);
    expect(queueEmail).not.toHaveBeenCalled();
  });

  it('returns 200 and queues a new email for a pending_verification user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'bob@example.com' });
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'verify_email', to: 'bob@example.com' }),
    );
  });

  it('normalises email to lowercase before lookup', async () => {
    await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'BOB@EXAMPLE.COM' });
    const call = mockPrisma.user.findFirst.mock.calls[0][0] as {
      where: { email: { equals: string } };
    };
    expect(call.where.email.equals).toBe('bob@example.com');
  });

  it('returns 200 with generic message for a disabled user (no email queued)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...mockPendingUser, status: 'disabled' });
    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .send({ email: 'bob@example.com' });
    expect(res.status).toBe(200);
    expect(queueEmail).not.toHaveBeenCalled();
  });
});
