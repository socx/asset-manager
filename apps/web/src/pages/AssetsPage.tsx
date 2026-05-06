import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TableCellsIcon,
  Squares2X2Icon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../store/authStore';
import { listPropertyAssets, type PropertyAssetListItem } from '../api/assets';

// ── helpers ───────────────────────────────────────────────────────────────────

function requireAccessToken(token: string | null): string {
  if (!token) throw new Error('Not authenticated');
  return token;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function addressOneLine(a: PropertyAssetListItem): string {
  return [a.addressLine1, a.city, a.postCode].filter(Boolean).join(', ');
}

function latestValuation(a: PropertyAssetListItem): string {
  const v = a.valuations[0];
  return v ? formatCurrency(v.valuationAmount) : '—';
}

function ownerName(a: PropertyAssetListItem): string {
  return a.owner ? `${a.owner.firstName} ${a.owner.lastName}` : '—';
}

function managerName(a: PropertyAssetListItem): string {
  if (a.managedByUser) return `${a.managedByUser.firstName} ${a.managedByUser.lastName}`;
  if (a.managedByCompany) return a.managedByCompany.name;
  return '—';
}

const VIEW_MODE_KEY = 'asset-view-mode';

// ── Table row ─────────────────────────────────────────────────────────────────

function AssetTableRow({ asset, onClick }: { asset: PropertyAssetListItem; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      <td className="px-4 py-3 text-sm font-medium text-sky-600 dark:text-sky-400 whitespace-nowrap">
        {asset.customAlias ?? asset.code}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
        {addressOneLine(asset)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
        {asset.propertyPurpose?.name ?? '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
        {asset.propertyStatus?.name ?? '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
        {latestValuation(asset)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
        {ownerName(asset)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
        {managerName(asset)}
      </td>
    </tr>
  );
}

// ── Tile card ─────────────────────────────────────────────────────────────────

function AssetTile({ asset, onClick }: { asset: PropertyAssetListItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2 hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <p className="text-sm font-semibold text-sky-600 dark:text-sky-400 truncate">
        {asset.customAlias ?? asset.code}
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{addressOneLine(asset)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{asset.propertyPurpose?.name ?? '—'}</span>
        <span>{asset.propertyStatus?.name ?? '—'}</span>
        <span className="font-medium text-gray-700 dark:text-gray-200">{latestValuation(asset)}</span>
      </div>
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
      <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
        {hasSearch ? 'No assets match your search' : 'No assets yet'}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {hasSearch
          ? 'Try a different search term.'
          : 'Register your first property asset to get started.'}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'table' | 'tile'>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      return stored === 'tile' ? 'tile' : 'table';
    } catch {
      return 'table';
    }
  });

  // Debounce search
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQ(value);
      setCursor(undefined);
    }, 300);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['assets', debouncedQ, cursor],
    queryFn: () => listPropertyAssets({ q: debouncedQ || undefined, cursor, limit: 20 }, requireAccessToken(accessToken)),
    placeholderData: (prev) => prev,
  });

  function switchView(mode: 'table' | 'tile') {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
  }

  const assets = data?.assets ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Search by code, address, owner…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto py-6">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => switchView('table')}
              aria-label="Table view"
              className={`p-2 ${viewMode === 'table' ? 'bg-sky-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <TableCellsIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => switchView('tile')}
              aria-label="Tile view"
              className={`p-2 ${viewMode === 'tile' ? 'bg-sky-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => navigate('/assets/new')}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700"
          >
            Register New Asset
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center" role="status">Loading assets…</p>
      )}

      {isError && (
        <p className="text-sm text-red-600 dark:text-red-400 py-8 text-center">Failed to load assets. Please try again.</p>
      )}

      {!isLoading && !isError && assets.length === 0 && (
        <EmptyState hasSearch={!!debouncedQ} />
      )}

      {!isLoading && !isError && assets.length > 0 && viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['Property Code', 'Address', 'Type', 'Status', 'Current Valuation', 'Owner', 'Manager'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {assets.map((a) => (
                <AssetTableRow key={a.id} asset={a} onClick={() => navigate(`/assets/${a.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError && assets.length > 0 && viewMode === 'tile' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((a) => (
            <AssetTile key={a.id} asset={a} onClick={() => navigate(`/assets/${a.id}`)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(cursor || data?.nextCursor) && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setCursor(undefined)}
            disabled={!cursor}
            className="text-sm text-sky-600 dark:text-sky-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← First page
          </button>
          <button
            onClick={() => setCursor(data?.nextCursor ?? undefined)}
            disabled={!data?.nextCursor}
            className="text-sm text-sky-600 dark:text-sky-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Load more →
          </button>
        </div>
      )}
    </div>
  );
}
