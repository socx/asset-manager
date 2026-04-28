import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900">Asset Manager</span>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">Admin</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{user?.firstName} {user?.lastName}</span>
          <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 capitalize">
            {user?.role.replace('_', ' ')}
          </span>
          <Link to="/" className="text-gray-400 hover:text-gray-600 text-xs">
            ← App
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin panel</h1>
        <p className="text-sm text-gray-500 mb-8">
          Platform administration — user management, audit logs, and system settings.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AdminCard
            title="User Management"
            description="Create, edit, enable, disable, and delete users. Manage roles and sessions."
            href="/admin/users"
            available={false}
          />
          <AdminCard
            title="Audit Logs"
            description="Browse the complete audit trail of all system events."
            href="/admin/audit-logs"
            available={false}
          />
          <AdminCard
            title="System Logs"
            description="View structured application logs with level filtering and trace-ID drill-down."
            href="/admin/system-logs"
            available={false}
          />
          {user?.role === 'super_admin' && (
            <AdminCard
              title="System Settings"
              description="Configure platform-wide behaviour: registration, lockout policy, token expiry."
              href="/admin/settings"
              available={false}
            />
          )}
        </div>
      </main>
    </div>
  );
}

interface AdminCardProps {
  title: string;
  description: string;
  href: string;
  available: boolean;
}

function AdminCard({ title, description, href, available }: AdminCardProps) {
  const inner = (
    <div className={`rounded-lg border bg-white p-5 shadow-sm transition ${available ? 'hover:border-sky-400 hover:shadow-md cursor-pointer' : 'opacity-60 cursor-default'}`}>
      <div className="flex items-start justify-between mb-2">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {!available && (
          <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
            Coming soon
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );

  return available ? <Link to={href}>{inner}</Link> : <div>{inner}</div>;
}
