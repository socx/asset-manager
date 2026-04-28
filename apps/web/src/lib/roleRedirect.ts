/**
 * Returns the default post-login redirect path for a given role.
 *
 * - super_admin / system_admin → /admin
 * - all others → /
 */
export function getDefaultRedirect(role: string): string {
  if (role === 'super_admin' || role === 'system_admin') {
    return '/admin';
  }
  return '/';
}
