import { Role } from '@asset-manager/types';

// ── Action enum ───────────────────────────────────────────────────────────────

export const Action = {
  // Admin panel
  VIEW_ADMIN_PANEL: 'view_admin_panel',

  // User management
  MANAGE_USERS: 'manage_users',
  RESET_USER_MFA: 'reset_user_mfa',
  PROMOTE_DEMOTE_ADMIN: 'promote_demote_admin', // super_admin only

  // Audit + system logs
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  VIEW_SYSTEM_LOGS: 'view_system_logs',

  // System settings
  MANAGE_SYSTEM_SETTINGS: 'manage_system_settings', // super_admin only

  // Portfolio / asset management (ITER-2+)
  MANAGE_PORTFOLIOS: 'manage_portfolios',
  VIEW_OWN_PORTFOLIOS: 'view_own_portfolios',
} as const;

export type Action = (typeof Action)[keyof typeof Action];

// ── Permission map ────────────────────────────────────────────────────────────
// Each role lists the actions it is allowed to perform.

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  [Role.SUPER_ADMIN]: new Set<Action>(Object.values(Action)),

  [Role.SYSTEM_ADMIN]: new Set<Action>([
    Action.VIEW_ADMIN_PANEL,
    Action.MANAGE_USERS,
    Action.RESET_USER_MFA,
    Action.VIEW_AUDIT_LOGS,
    Action.VIEW_SYSTEM_LOGS,
  ]),

  [Role.ASSET_MANAGER]: new Set<Action>([
    Action.MANAGE_PORTFOLIOS,
    Action.VIEW_OWN_PORTFOLIOS,
  ]),

  [Role.ASSET_OWNER]: new Set<Action>([
    Action.VIEW_OWN_PORTFOLIOS,
  ]),
};

// ── hasPermission ─────────────────────────────────────────────────────────────

/**
 * Returns true if the given role is allowed to perform the given action.
 * Accepts the role as a string (as stored in the JWT payload and DB) for
 * convenience — unknown roles always return false.
 */
export function hasPermission(role: string, action: Action): boolean {
  const permissions = ROLE_PERMISSIONS[role as Role];
  return permissions?.has(action) ?? false;
}
