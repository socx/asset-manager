import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ResendVerificationPage from './pages/ResendVerificationPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import MfaChallengePage from './pages/MfaChallengePage';
import MfaSetupPage from './pages/MfaSetupPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import AssetsPage from './pages/AssetsPage';
import AssetDetailPage from './pages/AssetDetailPage';
import RegisterAssetWizard from './pages/RegisterAssetWizard';
import DashboardPage from './pages/admin/DashboardPage';
import UsersPage from './pages/admin/UsersPage';
import SettingsPage from './pages/admin/SettingsPage';
import AuditLogsPage from './pages/admin/AuditLogsPage';
import SystemLogsPage from './pages/admin/SystemLogsPage';
import LookupListPage from './pages/admin/LookupListPage';
import CompaniesPage from './pages/admin/CompaniesPage';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import ReauthModal from './components/ReauthModal';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5 },
  },
});

const ADMIN_ROLES = ['super_admin', 'system_admin'];

function AppRoutes() {
  const { ready } = useAuthBootstrap();
  if (!ready) return null;
  return (
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
              <AppShell title="Dashboard">
                <HomePage />
              </AppShell>
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
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppShell title="My Profile">
                <ProfilePage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets"
          element={
            <ProtectedRoute>
              <AppShell title="Assets">
                <AssetsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets/:id"
          element={
            <ProtectedRoute>
              <AppShell title="Asset Detail">
                <AssetDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />

        {/* Admin-only routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AppShell title="Dashboard">
                <DashboardPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AppShell title="User Management">
                <UsersPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute roles={['super_admin']}>
              <AppShell title="System Settings">
                <SettingsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings/lookup"
          element={<Navigate to="/admin/settings/lookup/document_type" replace />}
        />
        <Route
          path="/admin/settings/lookup/:type"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AppShell title="Lookup Lists">
                <LookupListPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings/companies"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AppShell title="Companies">
                <CompaniesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AppShell title="Audit Logs">
                <AuditLogsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/system-logs"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AppShell title="System Logs">
                <SystemLogsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets/new"
          element={
            <ProtectedRoute>
              <AppShell title="Register Asset">
                <RegisterAssetWizard />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets"
          element={
            <ProtectedRoute>
              <AppShell title="Assets">
                <AssetsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
      <ReauthModal />
    </QueryClientProvider>
  );
}
