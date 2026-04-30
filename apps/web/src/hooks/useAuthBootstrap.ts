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
 * Waits for Zustand's persist middleware to finish rehydrating from localStorage
 * (which is microtask-async even for synchronous storage), then optionally
 * silently refreshes the access token via the HttpOnly cookie if the user is
 * persisted but the in-memory token is gone (e.g. after a hard page reload).
 *
 * Returns `ready: true` once auth state is fully resolved so callers can gate
 * rendering until then, preventing ProtectedRoute from redirecting prematurely.
 */
export function useAuthBootstrap(): { ready: boolean } {
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait until Zustand has finished reading from localStorage
    if (!hasHydrated) return;

    // No persisted user — nothing to refresh, allow rendering immediately
    if (user === null) {
      setReady(true);
      return;
    }

    // Token already in memory (e.g. just logged in) — no refresh needed
    if (accessToken !== null) {
      setReady(true);
      return;
    }

    // User persisted but token gone — silently re-hydrate from the HttpOnly cookie.
    getOrStartRefresh()
      .then((res) => setAuth(res.user, res.accessToken))
      .catch(() => clearAuth())
      .finally(() => setReady(true));
  }, [hasHydrated]); // re-run only when hydration state changes

  return { ready };
}
