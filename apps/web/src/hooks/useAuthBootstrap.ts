import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { refresh, type LoginResponse } from '../api/auth';

/**
 * Module-level singleton: ensures only one /auth/refresh call is ever in-flight
 * regardless of how many times React mounts this hook (e.g. StrictMode double-
 * invocation). Both concurrent effects share the same Promise so the token is
 * only rotated once.
 */
let pendingRefresh: Promise<LoginResponse> | null = null;

function getOrStartRefresh(): Promise<LoginResponse> {
  if (!pendingRefresh) {
    pendingRefresh = refresh().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

/**
 * On page load: if the Zustand store has a persisted user but no access token
 * (i.e. the user refreshed the page), attempt a silent token refresh using the
 * HttpOnly refresh-token cookie. On success the access token is restored in
 * memory; on failure (cookie expired / revoked) the user is signed out.
 *
 * Returns `ready: true` once the bootstrap attempt has settled, so callers can
 * gate rendering until auth state is fully resolved.
 */
export function useAuthBootstrap(): { ready: boolean } {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  // If user is present and token is already in memory, no bootstrap needed.
  const [ready, setReady] = useState(!(user !== null && accessToken === null));

  useEffect(() => {
    if (user === null || accessToken !== null) {
      setReady(true);
      return;
    }

    // User persisted but token gone — silently re-hydrate from the HttpOnly cookie.
    getOrStartRefresh()
      .then((res) => setAuth(res.user, res.accessToken))
      .catch(() => clearAuth())
      .finally(() => setReady(true));
  }, []); // intentionally run once on mount only

  return { ready };
}
