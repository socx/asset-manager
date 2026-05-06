import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  _hasHydrated: boolean;
  setAuth: (user: AuthUser, accessToken: string) => void;
  clearAuth: () => void;
  setHasHydrated: (value: boolean) => void;
  // Re-auth (token renewal) UI state
  reauthVisible: boolean;
  setReauthVisible: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      _hasHydrated: false,
      reauthVisible: false,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      clearAuth: () => set({ user: null, accessToken: null }),
      setHasHydrated: (value) => set({ _hasHydrated: value }),
      setReauthVisible: (v: boolean) => set({ reauthVisible: v }),
    }),
    {
      name: 'auth-storage',
      // Only persist the user profile, never the token (token is in-memory only)
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
