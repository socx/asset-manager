import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  UserGroupIcon, ShieldCheckIcon, GlobeAltIcon,
  CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../store/authStore';
import {
  getActiveUsers, getPageActivity, getDashboardHealth,
  type ServiceStatus,
} from '../../api/dashboard';

const REFETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  colour: string;
}

function StatCard({ label, value, icon: Icon, colour }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${colour}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

// ── Service health badge ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ServiceStatus['status'] }) {
  const config = {
    healthy:  { icon: CheckCircleIcon,         cls: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400',  label: 'Healthy'  },
    degraded: { icon: ExclamationTriangleIcon,  cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400', label: 'Degraded' },
    offline:  { icon: XCircleIcon,             cls: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',          label: 'Offline'  },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data: activeUsers, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboard', 'active-users'],
    queryFn: () => getActiveUsers(accessToken ?? ''),
    enabled: !!accessToken,
    refetchInterval: REFETCH_INTERVAL,
  });

  const { data: pageActivity, isLoading: loadingPages } = useQuery({
    queryKey: ['dashboard', 'page-activity'],
    queryFn: () => getPageActivity(accessToken ?? ''),
    enabled: !!accessToken,
    refetchInterval: REFETCH_INTERVAL,
  });

  const { data: health } = useQuery({
    queryKey: ['dashboard', 'health'],
    queryFn: () => getDashboardHealth(accessToken ?? ''),
    enabled: !!accessToken,
    refetchInterval: REFETCH_INTERVAL,
  });

  const lastUpdated = activeUsers?.updatedAt
    ? new Date(activeUsers.updatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 lg:px-6 space-y-8">

      {/* ── Stats row ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Live Activity</h2>
          {lastUpdated && (
            <p className="text-xs text-gray-400 dark:text-gray-500">Last updated {lastUpdated}</p>
          )}
        </div>

        {loadingStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Admin Users Online"     value={activeUsers?.adminOnline ?? 0} icon={ShieldCheckIcon} colour="bg-violet-500" />
            <StatCard label="App Users Online"       value={activeUsers?.appOnline   ?? 0} icon={UserGroupIcon}   colour="bg-sky-500"    />
            <StatCard label="Total Online"           value={activeUsers?.totalOnline  ?? 0} icon={GlobeAltIcon}   colour="bg-emerald-500" />
          </div>
        )}
      </section>

      {/* ── 24-hour activity chart ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Active Sessions — Last 24 Hours
        </h2>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={activeUsers?.hourlyActivity ?? []} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-gray-500"
                interval={5}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-gray-500"
                width={28}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--tw-bg, white)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Top pages + health side-by-side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top pages table */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            Top 5 Active Pages
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {loadingPages ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
            ) : !pageActivity?.pages.length ? (
              <div className="p-6 text-center text-sm text-gray-400">No page activity in the last 5 minutes.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Page
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Active Users
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pageActivity.pages.map((p) => (
                    <tr key={p.path} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm font-mono text-gray-800 dark:text-gray-200">
                        {p.path}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                        {p.activeUsers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Service health */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            Service Health
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
            {[
              { name: 'API',    data: health?.api    },
              { name: 'DB',     data: health?.db     },
              { name: 'Worker', data: health?.worker },
            ].map(({ name, data }) => (
              <div key={name} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{name}</p>
                  {data?.checkedAt && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Checked {new Date(data.checkedAt).toLocaleTimeString()}
                    </p>
                  )}
                  {data?.latencyMs !== undefined && data.latencyMs >= 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{data.latencyMs} ms</p>
                  )}
                </div>
                {data
                  ? <StatusBadge status={data.status} />
                  : <span className="text-xs text-gray-400">–</span>
                }
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
