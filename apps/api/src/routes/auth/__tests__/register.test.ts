import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────
// IMPORTANT: jest.mock() factories are hoisted before variable declarations,
// so all mock state must be defined *inside* the factory then retrieved via jest.requireMock().

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('$argon2id$v=19$fake-hash'),
  argon2id: 2,
}));

const mockUser = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  role: 'asset_owner',
  status: 'pending_verification',
};

jest.mock('@asset-manager/db', () => ({
  prisma: {
    systemSetting: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../lib/email', () => ({ queueEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));

// Retrieve mock references after jest.mock() factories have run
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    systemSetting: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const validBody = {
  email: 'alice@example.com',
  password: 'Str0ng!Passw0rd#',
  firstName: 'Alice',
  lastName: 'Smith',
};

function makeMockTx() {
  return {
    user: { create: jest.fn().mockResolvedValue(mockUser) },
    emailVerification: { create: jest.fn().mockResolvedValue({}) },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.systemSetting.findUnique.mockResolvedValue({ value: 'true' });
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>) => fn(makeMockTx()),
    );
  });

  it('returns 201 with success message for a valid new user', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ message: expect.stringContaining('Verification email') });
  });

  it('normalises email to lowercase before persisting', async () => {
    let capturedTx: ReturnType<typeof makeMockTx> | undefined;
    mockPrisma.$transaction.mockImplementation((fn: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>) => {
      capturedTx = makeMockTx();
      return fn(capturedTx);
    });

    await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, email: 'ALICE@EXAMPLE.COM' });

    expect(capturedTx?.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'alice@example.com' }),
      }),
    );
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'a@b.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  it('returns 400 for an invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too weak', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, password: 'weakpassword' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty('password');
  });

  it('returns 400 when password has no special character', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validBody, password: 'Str0ngPassw0rd' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when email is already taken', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-id' });

    const res = await request(app).post('/api/v1/auth/register').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('returns 403 when self-registration is disabled', async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({ value: 'false' });

    const res = await request(app).post('/api/v1/auth/register').send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/disabled/i);
  });

  it('falls back to env when DB read for system setting fails', async () => {
    // DB throws but SELF_REGISTRATION_ENABLED env is 'true' — registration should proceed
    mockPrisma.systemSetting.findUnique.mockRejectedValue(new Error('DB unavailable'));

    const res = await request(app).post('/api/v1/auth/register').send(validBody);

    expect(res.status).toBe(201);
  });

  it('stores a hashed password, never the plaintext', async () => {
    let capturedTx: ReturnType<typeof makeMockTx> | undefined;
    mockPrisma.$transaction.mockImplementation((fn: (tx: ReturnType<typeof makeMockTx>) => Promise<unknown>) => {
      capturedTx = makeMockTx();
      return fn(capturedTx);
    });

    await request(app).post('/api/v1/auth/register').send(validBody);

    const createCall = capturedTx?.user.create.mock.calls[0][0] as { data: { passwordHash: string } };
    expect(createCall.data.passwordHash).not.toBe(validBody.password);
    expect(createCall.data.passwordHash).toMatch(/\$argon2id\$/);
  });
});

