import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../store/authStore';
import {
  createMortgage,
  createShareholding,
  createTransaction,
  createValuation,
  deletePropertyAsset,
  getPropertyAssetDetail,
  listTransactions,
  updatePropertyAsset,
  type CreateMortgagePayload,
  type CreateShareholdingPayload,
  type CreateTransactionPayload,
  type CreateValuationPayload,
} from '../api/assets';

const ADMIN_ROLES = new Set(['super_admin', 'system_admin']);

type TabKey = 'overview' | 'financials' | 'shareholding' | 'transactions' | 'documents';

function requireAccessToken(token: string | null): string {
  if (!token) throw new Error('Not authenticated');
  return token;
}

function money(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(value));
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditOverview, setShowEditOverview] = useState(false);

  const [overviewForm, setOverviewForm] = useState({
    addressLine1: '',
    city: '',
    postCode: '',
    country: '',
    description: '',
  });

  const [showValuationForm, setShowValuationForm] = useState(false);
  const [valuationForm, setValuationForm] = useState<CreateValuationPayload>({
    valuationDate: new Date().toISOString(),
    valuationAmount: 0,
    valuationMethod: '',
    valuedBy: '',
    notes: '',
  });

  const [showMortgageForm, setShowMortgageForm] = useState(false);
  const [mortgageForm, setMortgageForm] = useState<CreateMortgagePayload>({
    lender: '',
    productName: '',
    mortgageTypeId: '',
    loanAmount: 0,
    paymentStatusId: '',
    startDate: new Date().toISOString(),
    notes: '',
  });

  const [showShareholdingForm, setShowShareholdingForm] = useState(false);
  const [shareholdingForm, setShareholdingForm] = useState<CreateShareholdingPayload>({
    shareholderName: '',
    ownershipPercent: 0,
    profitPercent: 0,
    notes: '',
  });

  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionForm, setTransactionForm] = useState<CreateTransactionPayload>({
    date: new Date().toISOString(),
    description: '',
    amount: 0,
    categoryId: '',
  });

  const [transactionCursor, setTransactionCursor] = useState<string | undefined>(undefined);
  const [transactionSort, setTransactionSort] = useState<'desc' | 'asc'>('desc');
  const [transactionItems, setTransactionItems] = useState<Array<{
    id: string;
    date: string;
    description: string;
    amount: number | string;
    categoryId: string;
  }>>([]);

  const detailQuery = useQuery({
    queryKey: ['asset-detail', id],
    queryFn: () => getPropertyAssetDetail(String(id), requireAccessToken(accessToken)),
    enabled: Boolean(id),
  });

  const transactionsQuery = useQuery({
    queryKey: ['asset-transactions', id, transactionCursor],
    queryFn: () => listTransactions(String(id), { cursor: transactionCursor, limit: 15 }, requireAccessToken(accessToken)),
    enabled: Boolean(id) && activeTab === 'transactions',
  });

  const asset = detailQuery.data?.asset;

  useEffect(() => {
    if (!asset) return;
    setOverviewForm({
      addressLine1: asset.addressLine1,
      city: asset.city,
      postCode: asset.postCode,
      country: asset.country,
      description: asset.description ?? '',
    });
  }, [asset?.id]);

  useEffect(() => {
    if (!transactionsQuery.data) return;
    setTransactionItems((prev) => {
      const map = new Map(prev.map((row) => [row.id, row]));
      for (const row of transactionsQuery.data.items) {
        map.set(row.id, row);
      }
      return Array.from(map.values());
    });
  }, [transactionsQuery.data]);

  useEffect(() => {
    setTransactionCursor(undefined);
    setTransactionItems([]);
  }, [id]);

  const canEditOrDelete = useMemo(() => {
    if (!asset || !user) return false;
    if (ADMIN_ROLES.has(user.role)) return true;
    return asset.ownerId === user.id || asset.managedByUserId === user.id;
  }, [asset, user]);

  const latestValuation = asset?.valuations[0] ?? null;
  const activeMortgage = asset?.mortgages.find((m) => !m.settledAt) ?? null;

  const sortedTransactions = useMemo(() => {
    return [...transactionItems].sort((a, b) => {
      const delta = new Date(a.date).getTime() - new Date(b.date).getTime();
      return transactionSort === 'asc' ? delta : -delta;
    });
  }, [transactionItems, transactionSort]);

  const updateOverviewMutation = useMutation({
    mutationFn: () => updatePropertyAsset(String(id), {
      addressLine1: overviewForm.addressLine1,
      city: overviewForm.city,
      postCode: overviewForm.postCode,
      country: overviewForm.country,
      description: overviewForm.description || undefined,
    }, requireAccessToken(accessToken)),
    onSuccess: () => {
      setShowEditOverview(false);
      queryClient.invalidateQueries({ queryKey: ['asset-detail', id] });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: () => deletePropertyAsset(String(id), requireAccessToken(accessToken)),
    onSuccess: () => navigate('/assets'),
  });

  const createValuationMutation = useMutation({
    mutationFn: () => createValuation(String(id), valuationForm, requireAccessToken(accessToken)),
    onSuccess: () => {
      setShowValuationForm(false);
      queryClient.invalidateQueries({ queryKey: ['asset-detail', id] });
    },
  });

  const createMortgageMutation = useMutation({
    mutationFn: () => createMortgage(String(id), mortgageForm, requireAccessToken(accessToken)),
    onSuccess: () => {
      setShowMortgageForm(false);
      queryClient.invalidateQueries({ queryKey: ['asset-detail', id] });
    },
  });

  const createShareholdingMutation = useMutation({
    mutationFn: () => createShareholding(String(id), shareholdingForm, requireAccessToken(accessToken)),
    onSuccess: () => {
      setShowShareholdingForm(false);
      queryClient.invalidateQueries({ queryKey: ['asset-detail', id] });
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: () => createTransaction(String(id), transactionForm, requireAccessToken(accessToken)),
    onSuccess: () => {
      setShowTransactionForm(false);
      setTransactionCursor(undefined);
      setTransactionItems([]);
      queryClient.invalidateQueries({ queryKey: ['asset-transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['asset-detail', id] });
    },
  });

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
                onClick={() => setShowEditOverview((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <PencilSquareIcon className="h-4 w-4" /> Edit
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <TrashIcon className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </div>

        {showEditOverview && (
          <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Edit Overview</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.addressLine1} onChange={(e) => setOverviewForm((s) => ({ ...s, addressLine1: e.target.value }))} placeholder="Address line 1" />
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.city} onChange={(e) => setOverviewForm((s) => ({ ...s, city: e.target.value }))} placeholder="City" />
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.postCode} onChange={(e) => setOverviewForm((s) => ({ ...s, postCode: e.target.value }))} placeholder="Post code" />
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.country} onChange={(e) => setOverviewForm((s) => ({ ...s, country: e.target.value }))} placeholder="Country" />
              <textarea className="sm:col-span-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.description} onChange={(e) => setOverviewForm((s) => ({ ...s, description: e.target.value }))} placeholder="Description" rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600" onClick={() => setShowEditOverview(false)}>Cancel</button>
              <button type="button" className="px-3 py-1.5 text-sm rounded-lg bg-sky-600 text-white" onClick={() => updateOverviewMutation.mutate()} disabled={updateOverviewMutation.isPending}>Save</button>
            </div>
          </div>
        )}

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
                onClick={() => setActiveTab(key as TabKey)}
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
                <p className="text-2xl font-semibold text-sky-800 dark:text-sky-200 mt-1">{latestValuation ? money(latestValuation.valuationAmount) : 'No valuation yet'}</p>
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
                <p>Price: {money(asset.purchasePrice)}</p>
                <p>Financed: {asset.isFinanced ? 'Yes' : 'No'}</p>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-700 dark:text-gray-200">Valuation History</p>
                  <button type="button" onClick={() => setShowValuationForm((v) => !v)} className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"><PlusIcon className="h-4 w-4" /> Add</button>
                </div>
                {showValuationForm && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input type="date" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" onChange={(e) => setValuationForm((s) => ({ ...s, valuationDate: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
                    <input type="number" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Amount" onChange={(e) => setValuationForm((s) => ({ ...s, valuationAmount: Number(e.target.value) }))} />
                    <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Method" onChange={(e) => setValuationForm((s) => ({ ...s, valuationMethod: e.target.value }))} />
                    <button type="button" className="sm:col-span-3 rounded bg-sky-600 text-white px-3 py-1.5" onClick={() => createValuationMutation.mutate()} disabled={createValuationMutation.isPending}>Save valuation</button>
                  </div>
                )}
                {asset.valuations.length === 0 && <p className="mt-2 text-gray-500 dark:text-gray-400">No valuation entries.</p>}
                {asset.valuations.map((v) => <p key={v.id} className="mt-1">{new Date(v.valuationDate).toLocaleDateString('en-GB')} - {money(v.valuationAmount)}</p>)}
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-700 dark:text-gray-200">Mortgage History</p>
                  <button type="button" onClick={() => setShowMortgageForm((v) => !v)} className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"><PlusIcon className="h-4 w-4" /> Add</button>
                </div>
                {showMortgageForm && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Lender" onChange={(e) => setMortgageForm((s) => ({ ...s, lender: e.target.value }))} />
                    <input type="number" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Loan amount" onChange={(e) => setMortgageForm((s) => ({ ...s, loanAmount: Number(e.target.value) }))} />
                    <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Mortgage type ID" onChange={(e) => setMortgageForm((s) => ({ ...s, mortgageTypeId: e.target.value }))} />
                    <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Payment status ID" onChange={(e) => setMortgageForm((s) => ({ ...s, paymentStatusId: e.target.value }))} />
                    <input type="date" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" onChange={(e) => setMortgageForm((s) => ({ ...s, startDate: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
                    <button type="button" className="rounded bg-sky-600 text-white px-3 py-1.5" onClick={() => createMortgageMutation.mutate()} disabled={createMortgageMutation.isPending}>Save mortgage</button>
                  </div>
                )}
                {asset.mortgages.length === 0 && <p className="mt-1 text-gray-500 dark:text-gray-400">No mortgage entries.</p>}
                {asset.mortgages.map((m) => (
                  <div key={m.id} className="mt-2 flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 px-3 py-2">
                    <div>
                      <p>{m.lender} - {money(m.loanAmount)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Started {new Date(m.startDate).toLocaleDateString('en-GB')}</p>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${m.settledAt ? 'bg-gray-100 dark:bg-gray-800' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'}`}>
                      {m.settledAt ? 'Settled' : 'Active'}
                    </span>
                  </div>
                ))}
                {activeMortgage && <p className="mt-2 text-xs text-green-700 dark:text-green-300">Active mortgage: {activeMortgage.lender}</p>}
              </div>
            </div>
          )}

          {activeTab === 'shareholding' && (
            <div className="mt-4 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-700 dark:text-gray-200">Shareholding Entries</p>
                <button type="button" onClick={() => setShowShareholdingForm((v) => !v)} className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"><PlusIcon className="h-4 w-4" /> Add</button>
              </div>
              {showShareholdingForm && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Shareholder name" onChange={(e) => setShareholdingForm((s) => ({ ...s, shareholderName: e.target.value }))} />
                  <input type="number" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Ownership %" onChange={(e) => setShareholdingForm((s) => ({ ...s, ownershipPercent: Number(e.target.value) }))} />
                  <input type="number" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Profit %" onChange={(e) => setShareholdingForm((s) => ({ ...s, profitPercent: Number(e.target.value) }))} />
                  <button type="button" className="sm:col-span-3 rounded bg-sky-600 text-white px-3 py-1.5" onClick={() => createShareholdingMutation.mutate()} disabled={createShareholdingMutation.isPending}>Save shareholding</button>
                </div>
              )}
              {asset.shareholdings.length === 0 && <p className="mt-2 text-gray-500 dark:text-gray-400">No shareholding entries.</p>}
              {asset.shareholdings.map((s) => <p key={s.id} className="py-1">{s.shareholderName}: {Number(s.ownershipPercent)}%</p>)}
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="mt-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-700 dark:text-gray-200">Transactions</p>
                  <select value={transactionSort} onChange={(e) => setTransactionSort(e.target.value as 'asc' | 'desc')} className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs">
                    <option value="desc">Newest first</option>
                    <option value="asc">Oldest first</option>
                  </select>
                </div>
                <button type="button" onClick={() => setShowTransactionForm((v) => !v)} className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"><PlusIcon className="h-4 w-4" /> Add</button>
              </div>

              {showTransactionForm && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input type="date" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" onChange={(e) => setTransactionForm((s) => ({ ...s, date: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
                  <input type="number" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Amount" onChange={(e) => setTransactionForm((s) => ({ ...s, amount: Number(e.target.value) }))} />
                  <input className="sm:col-span-2 rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Description" onChange={(e) => setTransactionForm((s) => ({ ...s, description: e.target.value }))} />
                  <input className="sm:col-span-2 rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Category ID" onChange={(e) => setTransactionForm((s) => ({ ...s, categoryId: e.target.value }))} />
                  <button type="button" className="sm:col-span-2 rounded bg-sky-600 text-white px-3 py-1.5" onClick={() => createTransactionMutation.mutate()} disabled={createTransactionMutation.isPending}>Save transaction</button>
                </div>
              )}

              {sortedTransactions.length === 0 && <p className="mt-2 text-gray-500 dark:text-gray-400">No transactions yet.</p>}
              {sortedTransactions.map((t) => (
                <p key={t.id} className="py-1">{new Date(t.date).toLocaleDateString('en-GB')} - {t.description} - {money(t.amount)}</p>
              ))}

              <div className="mt-3">
                <button
                  type="button"
                  disabled={!transactionsQuery.data?.nextCursor || transactionsQuery.isFetching}
                  onClick={() => setTransactionCursor(transactionsQuery.data?.nextCursor ?? undefined)}
                  className="text-xs text-sky-600 dark:text-sky-400 disabled:opacity-40"
                >
                  {transactionsQuery.isFetching ? 'Loading...' : 'Load more'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Documents module arrives in ITER-5.
            </div>
          )}
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-5 space-y-3">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">Delete asset?</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">This performs a soft delete and hides the asset from listings.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button type="button" className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white" onClick={() => deleteAssetMutation.mutate()} disabled={deleteAssetMutation.isPending}>Confirm delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
