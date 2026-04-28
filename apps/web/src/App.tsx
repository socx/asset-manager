import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ResendVerificationPage from './pages/ResendVerificationPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import MfaChallengePage from './pages/MfaChallengePage';
import MfaSetupPage from './pages/MfaSetupPage';
import AdminPage from './pages/AdminPage';
import UsersPage from './pages/admin/UsersPage';
import SettingsPage from './pages/admin/SettingsPage';
import AuditLogsPage from './pages/admin/AuditLogsPage';
import SystemLogsPage from './pages/admin/SystemLogsPage';
import ProtectedRoute from './components/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5 },
  },
});

const ADMIN_ROLES = ['super_admin', 'system_admin'];

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/resend-verification" element={<ResendVerificationPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/mfa-challenge" element={<MfaChallengePage />} />

          {/* Authenticated routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mfa/setup"
            element={
              <ProtectedRoute>
                <MfaSetupPage />
              </ProtectedRoute>
            }
          />

          {/* Admin-only routes (ITER-1-013) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={ADMIN_ROLES}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute roles={ADMIN_ROLES}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <ProtectedRoute roles={ADMIN_ROLES}>
                <AuditLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/system-logs"
            element={
              <ProtectedRoute roles={ADMIN_ROLES}>
                <SystemLogsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Asset Manager</h1>
        <p className="mt-2 text-gray-500">Iteration 1 scaffold — ready for development.</p>
      </div>
    </div>
  );
}
