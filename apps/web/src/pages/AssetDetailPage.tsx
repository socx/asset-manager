import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../store/authStore';
import { getPropertyAssetDetail } from '../api/assets';

const ADMIN_ROLES = new Set(['super_admin', 'system_admin']);

function requireAccessToken(token: string | null): string {
  if (!token) throw new Error('Not authenticated');
  return token;
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const detailQuery = useQuery({
    queryKey: ['asset-detail', id],
    queryFn: async () => getPropertyAssetDetail(String(id), requireAccessToken(accessToken)),
    enabled: Boolean(id),
  });

  const asset = detailQuery.data?.asset;
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'shareholding' | 'transactions' | 'documents'>('overview');

  const latestValuation = asset?.valuations[0] ?? null;
  const activeMortgage = asset?.mortgages.find((m) => !m.settledAt) ?? null;

  const purchaseValue = asset?.purchasePrice;
  const purchasePrice = purchaseValue === null || purchaseValue === undefined
    ? 'N/A'
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(purchaseValue));

  const currentValuationText = latestValuation
    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(latestValuation.valuationAmount))
    : 'No valuation yet';

  const canEditOrDelete = useMemo(() => {
    if (!asset || !user) return false;
    if (ADMIN_ROLES.has(user.role)) return true;
    return asset.ownerId === user.id || asset.managedByUserId === user.id;
  }, [asset, user]);

  if (detailQuery.isLoading) {
    return <p className="py-8 text-sm text-gray-500 dark:text-gray-400" role="status">Loading asset detail...</p>;
  }

  if (detailQuery.isError || !asset) {
    return <p className="py-8 text-sm text-red-600 dark:text-red-400">Failed to load asset detail.</p>;
  }

  return (
    <div className="space-y-6">
      <nav className="text-sm text-gray-500 dark:text-gray-400">
        <Link to="/assets" className="hover:underline">Assets</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700 dark:text-gray-200">{asset.customAlias ?? asset.code}</span>
      </nav>

      <button
        onClick={() => navigate('/assets')}
        className="inline-flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Assets
      </button>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{asset.customAlias ?? asset.code}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {[asset.addressLine1, asset.city, asset.postCode].filter(Boolean).join(', ')}
            </p>
          </div>

          {canEditOrDelete && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <PencilSquareIcon className="h-4 w-4" /> Edit
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <TrashIcon className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-5 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex flex-wrap gap-2">
            {[
              ['overview', 'Overview'],
              ['financials', 'Financials'],
              ['shareholding', 'Shareholding'],
              ['transactions', 'Transactions'],
              ['documents', 'Documents'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as 'overview' | 'financials' | 'shareholding' | 'transactions' | 'documents')}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  activeTab === key
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-sky-700 dark:text-sky-300 font-semibold">Current Valuation</p>
                <p className="text-2xl font-semibold text-sky-800 dark:text-sky-200 mt-1">{currentValuationText}</p>
                {latestValuation && <p className="text-xs text-sky-700/80 dark:text-sky-300/80 mt-1">As of {new Date(latestValuation.valuationDate).toLocaleDateString('en-GB')}</p>}
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                <div><dt className="text-xs uppercase tracking-wide">Purpose</dt><dd className="text-sm mt-0.5">{asset.propertyPurpose?.name ?? 'N/A'}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide">Status</dt><dd className="text-sm mt-0.5">{asset.propertyStatus?.name ?? 'N/A'}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide">Owner</dt><dd className="text-sm mt-0.5">{asset.owner ? `${asset.owner.firstName} ${asset.owner.lastName}` : 'N/A'}</dd></div>
                <div><dt className="text-xs uppercase tracking-wide">Manager</dt><dd className="text-sm mt-0.5">{asset.managedByUser ? `${asset.managedByUser.firstName} ${asset.managedByUser.lastName}` : asset.managedByCompany?.name ?? 'N/A'}</dd></div>
              </dl>
            </div>
          )}

          {activeTab === 'financials' && (
            <div className="mt-4 space-y-4 text-sm">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p className="font-medium text-gray-700 dark:text-gray-200">Purchase Info</p>
                <p className="mt-1">Date: {asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString('en-GB') : 'N/A'}</p>
                <p>Price: {purchasePrice}</p>
                <p>Financed: {asset.isFinanced ? 'Yes' : 'No'}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p className="font-medium text-gray-700 dark:text-gray-200">Mortgage History</p>
                {asset.mortgages.length === 0 && <p className="mt-1 text-gray-500 dark:text-gray-400">No mortgage entries.</p>}
                {asset.mortgages.map((m) => (
                  <div key={m.id} className="mt-2 flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 px-3 py-2">
                    <div>
                      <p>{m.lender} - {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(m.loanAmount))}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Started {new Date(m.startDate).toLocaleDateString('en-GB')}</p>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${m.settledAt ? 'bg-gray-100 dark:bg-gray-800' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'}`}>
                      {m.settledAt ? 'Settled' : 'Active'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'shareholding' && (
            <div className="mt-4 text-sm">
              {asset.shareholdings.length === 0 && <p className="text-gray-500 dark:text-gray-400">No shareholding entries.</p>}
              {asset.shareholdings.map((s) => (
                <p key={s.id} className="py-1">{s.shareholderName}: {Number(s.ownershipPercent)}%</p>
              ))}
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="mt-4 text-sm">
              {asset.transactions.length === 0 && <p className="text-gray-500 dark:text-gray-400">No transactions yet.</p>}
              {asset.transactions.slice(0, 10).map((t) => (
                <p key={t.id} className="py-1">{new Date(t.date).toLocaleDateString('en-GB')} - {t.description}</p>
              ))}
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Documents module arrives in ITER-5.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
