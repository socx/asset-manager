import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userSession: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    mfaBackupCode: { deleteMany: jest.fn() },
    emailVerification: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../lib/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue('1'), // step-up granted by default
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../../../lib/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../lib/email', () => ({
  queueEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('$argon2id$v=19$hashed'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
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

// ── Mock references ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as {
  prisma: {
    user: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    userSession: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    mfaBackupCode: { deleteMany: jest.Mock };
    emailVerification: { create: jest.Mock };
    $transaction: jest.Mock;
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis: mockRedis } = jest.requireMock('../../../lib/redis') as {
  redis: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'admin-uuid-1',
    email: 'admin@example.com',
    role: 'system_admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

function makeSuperAdminPayload() {
  return makeAdminPayload({ role: 'super_admin' });
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-uuid-2',
    email: 'user@example.com',
    firstName: 'Bob',
    lastName: 'Smith',
    role: 'asset_owner',
    status: 'active',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    mfaEnabled: false,
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    passwordHash: '$argon2id$v=19$hash',
    ...overrides,
  };
}

const ADMIN_AUTH = 'Bearer valid-admin-token';

// ── Test suites ───────────────────────────────────────────────────────────────

describe('Admin User API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: access token is valid as system_admin
    mockVerifyToken.mockReturnValue(makeAdminPayload());
    // Default: step-up is granted
    mockRedis.get.mockResolvedValue('1');
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  describe('Auth & permission guards', () => {
    it('401 — no token', async () => {
      await request(app).get('/api/v1/admin/users').expect(401);
    });

    it('403 — wrong role (asset_owner)', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'asset_owner' }));
      await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', ADMIN_AUTH)
        .expect(403);
    });

    it('403 — step-up not completed', async () => {
      mockRedis.get.mockResolvedValue(null);
      await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', ADMIN_AUTH)
        .expect(403)
        .expect((res) => {
          expect((res.body as { code: string }).code).toBe('STEP_UP_REQUIRED');
        });
    });
  });

  // ── GET /admin/users ─────────────────────────────────────────────────────────

  describe('GET /api/v1/admin/users', () => {
    it('200 — returns paginated user list', async () => {
      const users = [makeUser(), makeUser({ id: 'user-uuid-3', email: 'carol@example.com' })];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect((res.body as { users: unknown[] }).users).toHaveLength(2);
      expect((res.body as { nextCursor: null }).nextCursor).toBeNull();
    });

    it('200 — returns nextCursor when there are more results', async () => {
      // Return 26 users when limit is 25 → triggers hasMore
      const users = Array.from({ length: 26 }, (_, i) => makeUser({ id: `u${i}` }));
      mockPrisma.user.findMany.mockResolvedValue(users);

      const res = await request(app)
        .get('/api/v1/admin/users?limit=25')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect((res.body as { users: unknown[] }).users).toHaveLength(25);
      expect((res.body as { nextCursor: string }).nextCursor).toBe('u24');
    });

    it('200 — accepts cursor, role, status, search filters', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/admin/users?cursor=abc&role=asset_owner&status=active&search=bob')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'abc' },
          skip: 1,
        }),
      );
    });
  });

  // ── GET /admin/users/:id ─────────────────────────────────────────────────────

  describe('GET /api/v1/admin/users/:id', () => {
    it('200 — returns user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());

      const res = await request(app)
        .get('/api/v1/admin/users/user-uuid-2')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect((res.body as { user: { id: string } }).user.id).toBe('user-uuid-2');
    });

    it('404 — user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app)
        .get('/api/v1/admin/users/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .expect(404);
    });
  });

  // ── POST /admin/users ────────────────────────────────────────────────────────

  describe('POST /api/v1/admin/users', () => {
    const createBody = {
      email: 'new@example.com',
      password: 'Str0ng!Passw0rd#',
      firstName: 'New',
      lastName: 'User',
      role: 'asset_owner',
    };

    it('201 — creates user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null); // no existing
      const createdUser = makeUser({ id: 'new-uuid', email: 'new@example.com', firstName: 'New', lastName: 'User' });
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue(createdUser),
          },
          emailVerification: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', ADMIN_AUTH)
        .send(createBody)
        .expect(201);

      expect((res.body as { user: { email: string } }).user.email).toBe('new@example.com');
    });

    it('409 — duplicate email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser()); // existing

      await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', ADMIN_AUTH)
        .send(createBody)
        .expect(409);
    });

    it('400 — validation: weak password', async () => {
      await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', ADMIN_AUTH)
        .send({ ...createBody, password: 'weak' })
        .expect(400);
    });

    it('400 — validation: invalid role', async () => {
      await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', ADMIN_AUTH)
        .send({ ...createBody, role: 'unknown_role' })
        .expect(400);
    });
  });

  // ── PATCH /admin/users/:id ───────────────────────────────────────────────────

  describe('PATCH /api/v1/admin/users/:id', () => {
    it('200 — updates user name', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue(makeUser({ firstName: 'Updated' }));

      const res = await request(app)
        .patch('/api/v1/admin/users/user-uuid-2')
        .set('Authorization', ADMIN_AUTH)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect((res.body as { user: { firstName: string } }).user.firstName).toBe('Updated');
    });

    it('400 — cannot change own role', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ sub: 'user-uuid-2' }));
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ id: 'user-uuid-2', role: 'system_admin' }));

      await request(app)
        .patch('/api/v1/admin/users/user-uuid-2')
        .set('Authorization', ADMIN_AUTH)
        .send({ role: 'asset_owner' })
        .expect(400);
    });

    it('409 — duplicate email', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(makeUser()) // target user found
        .mockResolvedValueOnce(makeUser({ id: 'other-uuid', email: 'taken@example.com' })); // email clash

      await request(app)
        .patch('/api/v1/admin/users/user-uuid-2')
        .set('Authorization', ADMIN_AUTH)
        .send({ email: 'taken@example.com' })
        .expect(409);
    });

    it('404 — user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app)
        .patch('/api/v1/admin/users/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .send({ firstName: 'X' })
        .expect(404);
    });

    it('400 — no fields provided', async () => {
      await request(app)
        .patch('/api/v1/admin/users/user-uuid-2')
        .set('Authorization', ADMIN_AUTH)
        .send({})
        .expect(400);
    });
  });

  // ── PATCH /admin/users/:id/status ────────────────────────────────────────────

  describe('PATCH /api/v1/admin/users/:id/status', () => {
    it('200 — disables user and revokes sessions', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ status: 'active' }));
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.userSession.updateMany.mockResolvedValue({ count: 2 });

      await request(app)
        .patch('/api/v1/admin/users/user-uuid-2/status')
        .set('Authorization', ADMIN_AUTH)
        .send({ status: 'disabled' })
        .expect(200);

      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-uuid-2' }) }),
      );
    });

    it('200 — enables user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ status: 'disabled' }));
      mockPrisma.user.update.mockResolvedValue({});

      const res = await request(app)
        .patch('/api/v1/admin/users/user-uuid-2/status')
        .set('Authorization', ADMIN_AUTH)
        .send({ status: 'active' })
        .expect(200);

      expect((res.body as { message: string }).message).toContain('enabled');
      expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled();
    });

    it('200 — no-op if already same status', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ status: 'active' }));

      await request(app)
        .patch('/api/v1/admin/users/user-uuid-2/status')
        .set('Authorization', ADMIN_AUTH)
        .send({ status: 'active' })
        .expect(200);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('400 — cannot change own status', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ sub: 'user-uuid-2' }));

      await request(app)
        .patch('/api/v1/admin/users/user-uuid-2/status')
        .set('Authorization', ADMIN_AUTH)
        .send({ status: 'disabled' })
        .expect(400);
    });

    it('404 — user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app)
        .patch('/api/v1/admin/users/nonexistent/status')
        .set('Authorization', ADMIN_AUTH)
        .send({ status: 'disabled' })
        .expect(404);
    });

    it('400 — invalid status value', async () => {
      await request(app)
        .patch('/api/v1/admin/users/user-uuid-2/status')
        .set('Authorization', ADMIN_AUTH)
        .send({ status: 'pending_verification' })
        .expect(400);
    });
  });

  // ── DELETE /admin/users/:id ───────────────────────────────────────────────────

  describe('DELETE /api/v1/admin/users/:id', () => {
    it('200 — soft-deletes user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.$transaction.mockResolvedValue([{}, { count: 1 }]);

      const res = await request(app)
        .delete('/api/v1/admin/users/user-uuid-2')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect((res.body as { message: string }).message).toContain('deleted');
    });

    it('400 — cannot delete own account', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ sub: 'user-uuid-2' }));

      await request(app)
        .delete('/api/v1/admin/users/user-uuid-2')
        .set('Authorization', ADMIN_AUTH)
        .expect(400);
    });

    it('404 — user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app)
        .delete('/api/v1/admin/users/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .expect(404);
    });
  });

  // ── POST /admin/users/:id/reset-mfa ──────────────────────────────────────────

  describe('POST /api/v1/admin/users/:id/reset-mfa', () => {
    it('403 — system_admin cannot reset MFA (super_admin only)', async () => {
      await request(app)
        .post('/api/v1/admin/users/user-uuid-2/reset-mfa')
        .set('Authorization', ADMIN_AUTH)
        .expect(403);
    });

    it('200 — super_admin resets MFA', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ mfaEnabled: true }));
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const res = await request(app)
        .post('/api/v1/admin/users/user-uuid-2/reset-mfa')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect((res.body as { message: string }).message).toContain('MFA reset');
    });

    it('404 — user not found', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app)
        .post('/api/v1/admin/users/nonexistent/reset-mfa')
        .set('Authorization', ADMIN_AUTH)
        .expect(404);
    });
  });

  // ── GET /admin/users/:id/sessions ─────────────────────────────────────────────

  describe('GET /api/v1/admin/users/:id/sessions', () => {
    it('200 — returns active sessions', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.userSession.findMany.mockResolvedValue([
        { id: 'sess-1', ipAddress: '127.0.0.1', userAgent: 'Chrome', createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) },
      ]);

      const res = await request(app)
        .get('/api/v1/admin/users/user-uuid-2/sessions')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect((res.body as { sessions: unknown[] }).sessions).toHaveLength(1);
    });

    it('404 — user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await request(app)
        .get('/api/v1/admin/users/nonexistent/sessions')
        .set('Authorization', ADMIN_AUTH)
        .expect(404);
    });
  });

  // ── DELETE /admin/users/:id/sessions/:sessionId ────────────────────────────────

  describe('DELETE /api/v1/admin/users/:id/sessions/:sessionId', () => {
    it('200 — revokes session', async () => {
      mockPrisma.userSession.findFirst.mockResolvedValue({ id: 'sess-1' });
      mockPrisma.userSession.update.mockResolvedValue({});

      await request(app)
        .delete('/api/v1/admin/users/user-uuid-2/sessions/sess-1')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      expect(mockPrisma.userSession.update).toHaveBeenCalled();
    });

    it('404 — session not found', async () => {
      mockPrisma.userSession.findFirst.mockResolvedValue(null);

      await request(app)
        .delete('/api/v1/admin/users/user-uuid-2/sessions/nonexistent')
        .set('Authorization', ADMIN_AUTH)
        .expect(404);
    });
  });
});
