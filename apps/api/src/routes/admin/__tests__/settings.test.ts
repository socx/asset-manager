import request from 'supertest';
import { createApp } from '../../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@asset-manager/db', () => ({
  prisma: {},
}));

jest.mock('../../../lib/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue('1'), // step-up granted by default
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../../../lib/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../lib/settings', () => {
  const ALL_SETTING_KEYS = [
    'SELF_REGISTRATION_ENABLED',
    'MAX_LOGIN_ATTEMPTS',
    'ACCOUNT_LOCKOUT_MINUTES',
    'EMAIL_VERIFICATION_EXPIRY_HOURS',
    'PASSWORD_RESET_EXPIRY_HOURS',
  ];
  const SETTING_DEFINITIONS: Record<string, { type: string; description: string; default: string }> = {
    SELF_REGISTRATION_ENABLED: { type: 'boolean', description: 'Allow self-registration.', default: 'true' },
    MAX_LOGIN_ATTEMPTS: { type: 'number', description: 'Max failed logins before lockout.', default: '5' },
    ACCOUNT_LOCKOUT_MINUTES: { type: 'number', description: 'Lockout duration in minutes.', default: '30' },
    EMAIL_VERIFICATION_EXPIRY_HOURS: { type: 'number', description: 'Email verification expiry hours.', default: '24' },
    PASSWORD_RESET_EXPIRY_HOURS: { type: 'number', description: 'Password reset expiry hours.', default: '1' },
  };
  return {
    ALL_SETTING_KEYS,
    SETTING_DEFINITIONS,
    getSetting: jest.fn().mockResolvedValue('5'),
    getBoolSetting: jest.fn().mockResolvedValue(true),
    getNumSetting: jest.fn().mockResolvedValue(5),
    setSetting: jest.fn().mockResolvedValue(undefined),
    seedDefaultSettings: jest.fn().mockResolvedValue(undefined),
  };
});

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
const { verifyAccessToken: mockVerifyToken } = jest.requireMock('../../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis: mockRedis } = jest.requireMock('../../../lib/redis') as {
  redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSetting: mockGetSetting, setSetting: mockSetSetting } = jest.requireMock(
  '../../../lib/settings',
) as { getSetting: jest.Mock; setSetting: jest.Mock };

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

const ADMIN_AUTH = 'Bearer valid-admin-token';
const SUPER_AUTH = 'Bearer valid-super-token';

// ── Test suites ───────────────────────────────────────────────────────────────

describe('Admin Settings API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(makeAdminPayload());
    mockRedis.get.mockResolvedValue('1'); // step-up granted
    mockGetSetting.mockResolvedValue('5');
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  describe('Auth & permission guards', () => {
    it('401 — no token', async () => {
      await request(app).get('/api/v1/admin/settings').expect(401);
    });

    it('403 — wrong role (asset_owner)', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'asset_owner' }));
      await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', ADMIN_AUTH)
        .expect(403);
    });

    it('403 — step-up not completed', async () => {
      mockRedis.get.mockResolvedValue(null);
      await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', ADMIN_AUTH)
        .expect(403)
        .expect((res) => {
          expect((res.body as { code: string }).code).toBe('STEP_UP_REQUIRED');
        });
    });
  });

  // ── GET /admin/settings ──────────────────────────────────────────────────────

  describe('GET /api/v1/admin/settings', () => {
    it('200 — returns all 5 settings', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);

      const body = res.body as { settings: Array<{ key: string; value: string; type: string; description: string }> };
      expect(body.settings).toHaveLength(5);
      const keys = body.settings.map((s) => s.key);
      expect(keys).toContain('SELF_REGISTRATION_ENABLED');
      expect(keys).toContain('MAX_LOGIN_ATTEMPTS');
      expect(keys).toContain('ACCOUNT_LOCKOUT_MINUTES');
      expect(keys).toContain('EMAIL_VERIFICATION_EXPIRY_HOURS');
      expect(keys).toContain('PASSWORD_RESET_EXPIRY_HOURS');
    });

    it('200 — accessible by system_admin', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'system_admin' }));
      await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', ADMIN_AUTH)
        .expect(200);
    });
  });

  // ── PATCH /admin/settings/:key ───────────────────────────────────────────────

  describe('PATCH /api/v1/admin/settings/:key', () => {
    it('200 — super_admin can update a numeric setting', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());
      mockGetSetting.mockResolvedValue('5');

      const res = await request(app)
        .patch('/api/v1/admin/settings/MAX_LOGIN_ATTEMPTS')
        .set('Authorization', SUPER_AUTH)
        .send({ value: '10' })
        .expect(200);

      const body = res.body as { key: string; value: string; message: string };
      expect(body.key).toBe('MAX_LOGIN_ATTEMPTS');
      expect(body.value).toBe('10');
      expect(mockSetSetting).toHaveBeenCalledWith('MAX_LOGIN_ATTEMPTS', '10');
    });

    it('200 — super_admin can update a boolean setting', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());
      mockGetSetting.mockResolvedValue('true');

      await request(app)
        .patch('/api/v1/admin/settings/SELF_REGISTRATION_ENABLED')
        .set('Authorization', SUPER_AUTH)
        .send({ value: 'false' })
        .expect(200);

      expect(mockSetSetting).toHaveBeenCalledWith('SELF_REGISTRATION_ENABLED', 'false');
    });

    it('403 — system_admin cannot update settings', async () => {
      mockVerifyToken.mockReturnValue(makeAdminPayload({ role: 'system_admin' }));

      await request(app)
        .patch('/api/v1/admin/settings/MAX_LOGIN_ATTEMPTS')
        .set('Authorization', ADMIN_AUTH)
        .send({ value: '10' })
        .expect(403);
    });

    it('404 — unknown setting key', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());

      await request(app)
        .patch('/api/v1/admin/settings/NONEXISTENT_KEY')
        .set('Authorization', SUPER_AUTH)
        .send({ value: 'true' })
        .expect(404);
    });

    it('400 — invalid boolean value', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());

      await request(app)
        .patch('/api/v1/admin/settings/SELF_REGISTRATION_ENABLED')
        .set('Authorization', SUPER_AUTH)
        .send({ value: 'yes' })
        .expect(400);
    });

    it('400 — numeric value of zero', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());

      await request(app)
        .patch('/api/v1/admin/settings/MAX_LOGIN_ATTEMPTS')
        .set('Authorization', SUPER_AUTH)
        .send({ value: '0' })
        .expect(400);
    });

    it('400 — numeric value is non-numeric string', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());

      await request(app)
        .patch('/api/v1/admin/settings/MAX_LOGIN_ATTEMPTS')
        .set('Authorization', SUPER_AUTH)
        .send({ value: 'abc' })
        .expect(400);
    });

    it('400 — missing value field', async () => {
      mockVerifyToken.mockReturnValue(makeSuperAdminPayload());

      await request(app)
        .patch('/api/v1/admin/settings/MAX_LOGIN_ATTEMPTS')
        .set('Authorization', SUPER_AUTH)
        .send({})
        .expect(400);
    });
  });
});
