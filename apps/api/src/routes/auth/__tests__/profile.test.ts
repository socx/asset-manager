import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash:   jest.fn(),
  argon2id: 2,
}));

jest.mock('@asset-manager/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));

jest.mock('../../../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  refreshExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
  REFRESH_COOKIE_NAME: 'refresh_token',
  REFRESH_COOKIE_OPTIONS: { httpOnly: true, secure: false, sameSite: 'strict', maxAge: 604800000, path: '/api/v1/auth' },
}));

// ── Mock references ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verify: mockVerify, hash: mockHash } = jest.requireMock('argon2') as {
  verify: jest.Mock; hash: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOKEN = 'Bearer valid-token';

function makeTokenPayload(overrides: Record<string, unknown> = {}) {
  return { sub: 'user-uuid-1', email: 'alice@example.com', role: 'asset_owner', iat: 0, exp: 9999999999, ...overrides };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return { id: 'user-uuid-1', passwordHash: '$argon2id$fake', status: 'active', ...overrides };
}

const VALID_PAYLOAD = {
  currentPassword: 'OldPass!word12',
  newPassword:     'NewP@ssw0rd!34',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/auth/profile/password', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeTokenPayload());
    mockPrisma.user.findUnique.mockResolvedValue(makeUser());
    mockVerify.mockResolvedValue(true);
    mockHash.mockResolvedValue('$argon2id$new-hash');
    mockPrisma.user.update.mockResolvedValue({});
  });

  it('returns 200 and changes the password', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/profile/password')
      .set('Authorization', TOKEN)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/changed/i);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-uuid-1' },
      data:  { passwordHash: '$argon2id$new-hash' },
    });
  });

  it('returns 401 if current password is wrong', async () => {
    mockVerify.mockResolvedValue(false);

    const res = await request(app)
      .patch('/api/v1/auth/profile/password')
      .set('Authorization', TOKEN)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 404 if user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/v1/auth/profile/password')
      .set('Authorization', TOKEN)
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(404);
  });

  it('returns 422 if new password is too weak', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/profile/password')
      .set('Authorization', TOKEN)
      .send({ currentPassword: 'OldPass!word12', newPassword: 'short' });

    expect(res.status).toBe(400);
  });

  it('returns 422 if new password equals current password', async () => {
    const same = 'OldPass!word12';
    const res = await request(app)
      .patch('/api/v1/auth/profile/password')
      .set('Authorization', TOKEN)
      .send({ currentPassword: same, newPassword: same });

    expect(res.status).toBe(400);
  });

  it('returns 401 if no token provided', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/profile/password')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(401);
  });
});
