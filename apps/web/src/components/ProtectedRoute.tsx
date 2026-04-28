import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  /** Allowed roles. If omitted, any authenticated user is allowed. */
  roles?: string[];
  children: React.ReactNode;
}

/**
 * Wraps a route element to enforce authentication and optional role requirements.
 *
 * - Unauthenticated users are redirected to /login (with `from` state so the
 *   login page can redirect back after a successful sign-in).
 * - Authenticated users who lack the required role see a 403 page.
 */
export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Forbidden />;
  }

  return <>{children}</>;
}

function Forbidden() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full text-center">
        <p className="text-5xl mb-4">🚫</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access denied</h1>
        <p className="text-sm text-gray-500">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    </div>
  );
}
