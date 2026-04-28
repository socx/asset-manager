import request from 'supertest';
import express, { type Router } from 'express';
import { requireAuth, requireRole, requirePermission } from '../requireAuth';
import { Action } from '../../lib/permissions';
import { Role } from '@asset-manager/types';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('../../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyAccessToken } = jest.requireMock('../../lib/jwt') as {
  verifyAccessToken: jest.Mock;
};

// ── Test app factory ──────────────────────────────────────────────────────────
// Build a minimal Express app with configurable middleware chains so we can
// test each middleware in isolation without pulling in the full route tree.

function buildTestApp(middlewareChain: Router | express.RequestHandler[]) {
  const app = express();
  app.use(express.json());
  if (Array.isArray(middlewareChain)) {
    app.get(
      '/test',
      ...middlewareChain,
      (_req, res) => { res.status(200).json({ ok: true }); },
    );
  } else {
    app.use('/test', middlewareChain);
  }
  return app;
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'user-uuid-1',
    email: 'user@example.com',
    role: Role.ASSET_OWNER,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

// ── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 — no Authorization header', async () => {
    const app = buildTestApp([requireAuth]);
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  it('401 — Authorization header present but no Bearer prefix', async () => {
    const app = buildTestApp([requireAuth]);
    const res = await request(app).get('/test').set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  it('401 — Bearer token present but invalid/expired', async () => {
    mockVerifyAccessToken.mockImplementation(() => { throw new Error('jwt expired'); });
    const app = buildTestApp([requireAuth]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  it('passes through and attaches req.user for valid token', async () => {
    const payload = makePayload();
    mockVerifyAccessToken.mockReturnValue(payload);

    let capturedUser: unknown;
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth, (req, res) => {
      capturedUser = (req as typeof req & { user: unknown }).user;
      res.status(200).json({ ok: true });
    });

    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(capturedUser).toMatchObject({ sub: 'user-uuid-1', role: Role.ASSET_OWNER });
    expect(mockVerifyAccessToken).toHaveBeenCalledWith('valid-token');
  });
});

// ── requireRole ───────────────────────────────────────────────────────────────

describe('requireRole middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 — req.user not set (requireAuth not called first)', async () => {
    const app = buildTestApp([requireRole(Role.SYSTEM_ADMIN)]);
    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/insufficient permissions/i);
  });

  it('403 — user role does not match required role', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.ASSET_OWNER }));
    const app = buildTestApp([requireAuth, requireRole(Role.SYSTEM_ADMIN)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('403 — user role not in a multi-role list', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.ASSET_MANAGER }));
    const app = buildTestApp([requireAuth, requireRole(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('passes through for exact role match', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.SYSTEM_ADMIN }));
    const app = buildTestApp([requireAuth, requireRole(Role.SYSTEM_ADMIN)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('passes through when role is one of several allowed roles', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.SUPER_ADMIN }));
    const app = buildTestApp([requireAuth, requireRole(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });
});

// ── requirePermission ─────────────────────────────────────────────────────────

describe('requirePermission middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('403 — req.user not set', async () => {
    const app = buildTestApp([requirePermission(Action.VIEW_ADMIN_PANEL)]);
    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
  });

  it('403 — asset_owner cannot VIEW_ADMIN_PANEL', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.ASSET_OWNER }));
    const app = buildTestApp([requireAuth, requirePermission(Action.VIEW_ADMIN_PANEL)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('403 — asset_manager cannot MANAGE_USERS', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.ASSET_MANAGER }));
    const app = buildTestApp([requireAuth, requirePermission(Action.MANAGE_USERS)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('403 — system_admin cannot MANAGE_SYSTEM_SETTINGS (super_admin only)', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.SYSTEM_ADMIN }));
    const app = buildTestApp([requireAuth, requirePermission(Action.MANAGE_SYSTEM_SETTINGS)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });

  it('passes — system_admin can VIEW_ADMIN_PANEL', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.SYSTEM_ADMIN }));
    const app = buildTestApp([requireAuth, requirePermission(Action.VIEW_ADMIN_PANEL)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  it('passes — super_admin can do everything, including MANAGE_SYSTEM_SETTINGS', async () => {
    mockVerifyAccessToken.mockReturnValue(makePayload({ role: Role.SUPER_ADMIN }));
    const app = buildTestApp([requireAuth, requirePermission(Action.MANAGE_SYSTEM_SETTINGS)]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });
});

// ── hasPermission (unit tests via permissions.ts) ─────────────────────────────

describe('hasPermission utility', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { hasPermission } = jest.requireActual('../../lib/permissions') as typeof import('../../lib/permissions');

  it('returns false for unknown role', () => {
    expect(hasPermission('unknown_role', Action.VIEW_ADMIN_PANEL)).toBe(false);
  });

  it('super_admin has all permissions', () => {
    for (const action of Object.values(Action)) {
      expect(hasPermission(Role.SUPER_ADMIN, action)).toBe(true);
    }
  });

  it('system_admin has VIEW_ADMIN_PANEL, MANAGE_USERS, RESET_USER_MFA, VIEW_AUDIT_LOGS, VIEW_SYSTEM_LOGS', () => {
    expect(hasPermission(Role.SYSTEM_ADMIN, Action.VIEW_ADMIN_PANEL)).toBe(true);
    expect(hasPermission(Role.SYSTEM_ADMIN, Action.MANAGE_USERS)).toBe(true);
    expect(hasPermission(Role.SYSTEM_ADMIN, Action.RESET_USER_MFA)).toBe(true);
    expect(hasPermission(Role.SYSTEM_ADMIN, Action.VIEW_AUDIT_LOGS)).toBe(true);
    expect(hasPermission(Role.SYSTEM_ADMIN, Action.VIEW_SYSTEM_LOGS)).toBe(true);
  });

  it('system_admin does NOT have MANAGE_SYSTEM_SETTINGS or PROMOTE_DEMOTE_ADMIN', () => {
    expect(hasPermission(Role.SYSTEM_ADMIN, Action.MANAGE_SYSTEM_SETTINGS)).toBe(false);
    expect(hasPermission(Role.SYSTEM_ADMIN, Action.PROMOTE_DEMOTE_ADMIN)).toBe(false);
  });

  it('asset_manager can MANAGE_PORTFOLIOS and VIEW_OWN_PORTFOLIOS, not admin actions', () => {
    expect(hasPermission(Role.ASSET_MANAGER, Action.MANAGE_PORTFOLIOS)).toBe(true);
    expect(hasPermission(Role.ASSET_MANAGER, Action.VIEW_OWN_PORTFOLIOS)).toBe(true);
    expect(hasPermission(Role.ASSET_MANAGER, Action.VIEW_ADMIN_PANEL)).toBe(false);
  });

  it('asset_owner can only VIEW_OWN_PORTFOLIOS', () => {
    expect(hasPermission(Role.ASSET_OWNER, Action.VIEW_OWN_PORTFOLIOS)).toBe(true);
    expect(hasPermission(Role.ASSET_OWNER, Action.MANAGE_PORTFOLIOS)).toBe(false);
    expect(hasPermission(Role.ASSET_OWNER, Action.VIEW_ADMIN_PANEL)).toBe(false);
  });
});
