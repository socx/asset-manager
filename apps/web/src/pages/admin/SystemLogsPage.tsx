import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { ApiResponseError } from '../../api/auth';
import StepUpModal from '../../components/StepUpModal';
import {
  listSystemLogs,
  type SystemLog,
  type LogLevel,
  type ListSystemLogsParams,
} from '../../api/admin';

// ── Level config ──────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'bg-gray-100 text-gray-600',
  info: 'bg-blue-100 text-blue-800',
  warn: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  fatal: 'bg-purple-100 text-purple-800',
};

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];

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

// ── Filter state ──────────────────────────────────────────────────────────────

interface Filters {
  level: LogLevel | '';
  service: string;
  traceId: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = { level: '', service: '', traceId: '', dateFrom: '', dateTo: '' };

// ── Log detail drawer ─────────────────────────────────────────────────────────

function LogDetail({ log, onClose }: { log: SystemLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 text-sm">Log Detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3 text-sm">
          <Row label="ID" value={log.id} mono />
          <Row label="Time" value={formatDate(log.createdAt)} />
          <Row label="Level" value={<LevelBadge level={log.level} />} />
          <Row label="Service" value={log.service} mono />
          <Row label="Message" value={log.message} />
          {log.traceId && <Row label="Trace ID" value={log.traceId} mono />}
          {log.context != null ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Context</p>
              <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(log.context, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wide pt-0.5">{label}</span>
      <span className={`flex-1 text-gray-800 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function LevelBadge({ level }: { level: LogLevel }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium uppercase ${LEVEL_STYLES[level]}`}>
      {level}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SystemLogsPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allLogs, setAllLogs] = useState<SystemLog[]>([]);
  const [selected, setSelected] = useState<SystemLog | null>(null);
  const [lastDataId, setLastDataId] = useState<string | undefined>(undefined);

  const params: ListSystemLogsParams = {
    ...(applied.level ? { level: applied.level } : {}),
    ...(applied.service ? { service: applied.service } : {}),
    ...(applied.traceId ? { traceId: applied.traceId } : {}),
    ...(applied.dateFrom ? { dateFrom: applied.dateFrom } : {}),
    ...(applied.dateTo ? { dateTo: applied.dateTo } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 50,
  };

  const [stepUpVisible, setStepUpVisible] = useState(false);
  const [pendingFn, setPendingFn] = useState<(() => void) | null>(null);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'system-logs', applied, cursor],
    queryFn: () => listSystemLogs(params, accessToken ?? ''),
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

  // Merge pages into allLogs
  if (data && data.logs.length > 0 && data.logs[0].id !== lastDataId) {
    setLastDataId(data.logs[0].id);
    if (!cursor) {
      setAllLogs(data.logs);
    } else {
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

  // Drill-down: click a traceId to filter by it
  function drillDownTrace(traceId: string) {
    const newFilters = { ...EMPTY_FILTERS, traceId };
    setFilters(newFilters);
    setApplied(newFilters);
    setCursor(undefined);
    setAllLogs([]);
    setLastDataId(undefined);
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filter bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 dark:bg-gray-900 dark:border-gray-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <select
              value={filters.level}
              onChange={(e) => setFilters((f) => ({ ...f, level: e.target.value as LogLevel | '' }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">All levels</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Service"
              value={filters.service}
              onChange={(e) => setFilters((f) => ({ ...f, service: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />

            <input
              type="text"
              placeholder="Trace ID"
              value={filters.traceId}
              onChange={(e) => setFilters((f) => ({ ...f, traceId: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />

            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />

            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />

            <div className="flex gap-2">
              <button
                onClick={applyFilters}
                className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
              >
                Apply
              </button>
              <button
                onClick={resetFilters}
                className="flex-1 border border-gray-300 text-gray-600 rounded px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
              >
                Reset
              </button>
            </div>
          </div>

          {applied.traceId && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <span>Filtered by trace:</span>
              <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">{applied.traceId}</code>
              <button
                onClick={() => { setFilters((f) => ({ ...f, traceId: '' })); resetFilters(); }}
                className="text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Count */}
        {allLogs.length > 0 && (
          <p className="text-sm text-gray-500 mb-3">{allLogs.length} entries loaded</p>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-x-auto">
          {error && !(error instanceof ApiResponseError && error.code === 'STEP_UP_REQUIRED') && (
            <p className="text-center py-10 text-red-500 text-sm">Failed to load system logs.</p>
          )}

          {!error && allLogs.length === 0 && !isFetching && (
            <p className="text-center py-10 text-gray-400 text-sm">No entries found.</p>
          )}

          {allLogs.length > 0 && (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-white uppercase tracking-wide whitespace-nowrap">Time</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-white uppercase tracking-wide">Level</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-white uppercase tracking-wide">Service</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-white uppercase tracking-wide">Message</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-white uppercase tracking-wide">Trace ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {allLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => setSelected(log)}
                  >
                    <td className="py-2.5 px-4 text-gray-600 dark:text-white whitespace-nowrap font-mono text-xs">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-4">
                      <LevelBadge level={log.level} />
                    </td>
                    <td className="py-2.5 px-4 text-gray-600 dark:text-white font-mono text-xs">{log.service}</td>
                    <td className="py-2.5 px-4 text-gray-800 dark:text-white max-w-xs truncate">{log.message}</td>
                    <td className="py-2.5 px-4">
                      {log.traceId ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); drillDownTrace(log.traceId as string); }}
                          className="font-mono text-xs text-sky-600 hover:text-sky-800 hover:underline"
                          title="Filter by this trace ID"
                        >
                          {log.traceId.slice(0, 8)}…
                        </button>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {isFetching && (
            <p className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
          )}
        </div>

        {/* Load more */}
        {data?.nextCursor && !isFetching && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setCursor(data.nextCursor ?? undefined)}
              className="text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Load more
            </button>
          </div>
        )}
      </div>

      {/* Log detail drawer */}
      {selected && <LogDetail log={selected} onClose={() => setSelected(null)} />}

      {stepUpVisible && (
        <StepUpModal onSuccess={onStepUpSuccess} onCancel={onStepUpCancel} />
      )}
    </>
  );
}
