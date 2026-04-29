import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { ApiResponseError } from '../../api/auth';
import StepUpModal from '../../components/StepUpModal';
import {
  listAuditLogs,
  type AuditLog,
  type ListAuditLogsParams,
} from '../../api/admin';

// ── Known action values for the filter dropdown ───────────────────────────────

const KNOWN_ACTIONS = [
  'USER_LOGIN_SUCCESS',
  'USER_LOGIN_FAILED',
  'USER_LOGOUT',
  'USER_REGISTERED',
  'EMAIL_VERIFIED',
  'VERIFICATION_EMAIL_RESENT',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'MFA_VERIFY_SUCCESS',
  'MFA_VERIFY_FAILED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ENABLED',
  'USER_DISABLED',
  'USER_DELETED',
  'ROLE_CHANGED',
  'USER_MFA_RESET',
  'USER_SESSION_REVOKED',
  'SESSION_REVOKED',
  'ALL_SESSIONS_REVOKED',
  'SETTING_UPDATED',
] as const;

const KNOWN_ENTITY_TYPES = ['user', 'session', 'system_setting'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportToCsv(logs: AuditLog[]) {
  const headers = [
    'ID', 'Timestamp', 'Actor ID', 'Actor Role', 'Action',
    'Entity Type', 'Entity ID', 'IP Address', 'User Agent', 'Old Value', 'New Value',
  ];
  const rows = logs.map((log) => [
    log.id,
    log.createdAt,
    log.actorId ?? '',
    log.actorRole ?? '',
    log.action,
    log.entityType,
    log.entityId ?? '',
    log.ipAddress ?? '',
    log.userAgent ?? '',
    log.oldValue ? JSON.stringify(log.oldValue) : '',
    log.newValue ? JSON.stringify(log.newValue) : '',
  ]);

  const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Filter state ──────────────────────────────────────────────────────────────

interface Filters {
  action: string;
  entityType: string;
  actorId: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = {
  action: '',
  entityType: '',
  actorId: '',
  dateFrom: '',
  dateTo: '',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allLogs, setAllLogs] = useState<AuditLog[]>([]);

  const params: ListAuditLogsParams = {
    ...(applied.action ? { action: applied.action } : {}),
    ...(applied.entityType ? { entityType: applied.entityType } : {}),
    ...(applied.actorId ? { actorId: applied.actorId } : {}),
    ...(applied.dateFrom ? { dateFrom: applied.dateFrom } : {}),
    ...(applied.dateTo ? { dateTo: applied.dateTo } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 50,
  };

  const [stepUpVisible, setStepUpVisible] = useState(false);
  const [pendingFn, setPendingFn] = useState<(() => void) | null>(null);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'audit-logs', applied, cursor],
    queryFn: () => listAuditLogs(params, accessToken ?? ''),
    enabled: !!accessToken,
    retry: (_, err) => !(err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED'),
  });

  useEffect(() => {
    if (error instanceof ApiResponseError && error.code === 'STEP_UP_REQUIRED') {
      setPendingFn(() => () => void refetch());
      setStepUpVisible(true);
    }
  }, [error]);

  function onStepUpSuccess() {
    setStepUpVisible(false);
    pendingFn?.();
    setPendingFn(null);
  }

  function onStepUpCancel() {
    setStepUpVisible(false);
    setPendingFn(null);
  }

  // Append new page results to allLogs
  const prevQueryKey = JSON.stringify([applied, cursor]);
  const [lastKey, setLastKey] = useState(prevQueryKey);
  if (data && JSON.stringify([applied, cursor]) !== lastKey) {
    setLastKey(JSON.stringify([applied, cursor]));
  }

  // When new data arrives, merge into allLogs
  const [lastDataId, setLastDataId] = useState<string | undefined>(undefined);
  if (data && data.logs.length > 0 && data.logs[0].id !== lastDataId) {
    setLastDataId(data.logs[0].id);
    if (!cursor) {
      // Fresh search — replace
      setAllLogs(data.logs);
    } else {
      // Load more — append
      setAllLogs((prev) => [...prev, ...data.logs]);
    }
  }

  const applyFilters = useCallback(() => {
    setApplied(filters);
    setCursor(undefined);
    setAllLogs([]);
    setLastDataId(undefined);
  }, [filters]);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setCursor(undefined);
    setAllLogs([]);
    setLastDataId(undefined);
  }, []);

  const loadMore = useCallback(() => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  }, [data?.nextCursor]);

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filter bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <select
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All actions</option>
              {KNOWN_ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <select
              value={filters.entityType}
              onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All entity types</option>
              {KNOWN_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Actor ID"
              value={filters.actorId}
              onChange={(e) => setFilters((f) => ({ ...f, actorId: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex gap-2">
              <button
                onClick={applyFilters}
                className="flex-1 bg-indigo-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-indigo-700"
              >
                Apply
              </button>
              <button
                onClick={resetFilters}
                className="flex-1 border border-gray-300 text-gray-600 rounded px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            {allLogs.length > 0 ? `${allLogs.length} entries loaded` : ''}
          </p>
          {allLogs.length > 0 && (
            <button
              onClick={() => exportToCsv(allLogs)}
              className="text-sm border border-gray-300 text-gray-700 rounded px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1.5"
            >
              ↓ Export CSV
            </button>
          )}
        </div>

        {stepUpVisible && (
          <StepUpModal onSuccess={onStepUpSuccess} onCancel={onStepUpCancel} />
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          {error && !(error instanceof ApiResponseError && error.code === 'STEP_UP_REQUIRED') && (
            <p className="text-center py-10 text-red-500 text-sm">Failed to load audit logs.</p>
          )}

          {!error && allLogs.length === 0 && !isFetching && (
            <p className="text-center py-10 text-gray-400 text-sm">No entries found.</p>
          )}

          {allLogs.length > 0 && (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Time</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actor Role</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity Type</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity ID</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap font-mono text-xs">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-4 text-gray-700 capitalize text-xs">
                      {log.actorRole?.replace(/_/g, ' ') ?? '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="py-2.5 px-4 text-gray-600 text-xs">{log.entityType}</td>
                    <td className="py-2.5 px-4 text-gray-500 font-mono text-xs truncate max-w-[140px]">
                      {log.entityId ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 font-mono text-xs whitespace-nowrap">
                      {log.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {isFetching && (
            <p className="text-center py-4 text-gray-400 text-sm">Loading…</p>
          )}
        </div>

        {/* Load more */}
        {data?.nextCursor && !isFetching && (
          <div className="mt-4 text-center">
            <button
              onClick={loadMore}
              className="text-sm bg-white border border-gray-300 text-gray-700 rounded px-4 py-2 hover:bg-gray-50"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Action badge ──────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, string> = {
  USER_LOGIN_SUCCESS: 'bg-green-100 text-green-800',
  MFA_VERIFY_SUCCESS: 'bg-green-100 text-green-800',
  EMAIL_VERIFIED: 'bg-green-100 text-green-800',
  USER_REGISTERED: 'bg-blue-100 text-blue-800',
  USER_CREATED: 'bg-blue-100 text-blue-800',
  SETTING_UPDATED: 'bg-yellow-100 text-yellow-800',
  ROLE_CHANGED: 'bg-yellow-100 text-yellow-800',
  USER_DISABLED: 'bg-red-100 text-red-800',
  USER_DELETED: 'bg-red-100 text-red-800',
  USER_LOGIN_FAILED: 'bg-red-100 text-red-800',
  MFA_VERIFY_FAILED: 'bg-red-100 text-red-800',
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_STYLES[action] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {action}
    </span>
  );
}
