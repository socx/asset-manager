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
import { useWizardLookups } from '../hooks/useWizardLookups';
import { requireAccessToken, formatCurrency } from '../lib/utils';

const ADMIN_ROLES = new Set(['super_admin', 'system_admin']);

type TabKey = 'overview' | 'financials' | 'shareholding' | 'transactions' | 'documents';

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
    ownerId: '',
    managedByUserId: '',
    managedByCompanyId: '',
    ownershipTypeId: '',
    propertyPurposeId: '',
    purchaseDate: '',
    purchasePrice: '',
    depositPaid: '',
    dutiesTaxes: '',
    legalFees: '',
    description: '',
  });
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [showEditPurchase, setShowEditPurchase] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    purchaseDate: '',
    purchasePrice: '',
    depositPaid: '',
    dutiesTaxes: '',
    legalFees: '',
    isFinanced: false,
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
  const lookups = useWizardLookups(requireAccessToken(accessToken));

  useEffect(() => {
    if (!asset) return;
    setOverviewForm({
      addressLine1: asset.addressLine1,
      city: asset.city,
      postCode: asset.postCode,
      country: asset.country,
      ownerId: asset.ownerId,
      managedByUserId: asset.managedByUserId ?? user?.id ?? '',
      managedByCompanyId: asset.managedByCompanyId ?? '',
      ownershipTypeId: asset.ownershipTypeId,
      propertyPurposeId: asset.propertyPurposeId,
      purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : '',
      purchasePrice: asset.purchasePrice === null || asset.purchasePrice === undefined ? '' : String(asset.purchasePrice),
      depositPaid: asset.depositPaid === null || asset.depositPaid === undefined ? '' : String(asset.depositPaid),
      dutiesTaxes: asset.dutiesTaxes === null || asset.dutiesTaxes === undefined ? '' : String(asset.dutiesTaxes),
      legalFees: asset.legalFees === null || asset.legalFees === undefined ? '' : String(asset.legalFees),
      description: asset.description ?? '',
    });
    setPurchaseForm({
      purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : '',
      purchasePrice: asset.purchasePrice === null || asset.purchasePrice === undefined ? '' : String(asset.purchasePrice),
      depositPaid: asset.depositPaid === null || asset.depositPaid === undefined ? '' : String(asset.depositPaid),
      dutiesTaxes: asset.dutiesTaxes === null || asset.dutiesTaxes === undefined ? '' : String(asset.dutiesTaxes),
      legalFees: asset.legalFees === null || asset.legalFees === undefined ? '' : String(asset.legalFees),
      isFinanced: Boolean(asset.isFinanced),
    });
  }, [asset?.id, user?.id]);

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

  const userOptions = useMemo(() => {
    const options = lookups.users;
    if (!user) return options;
    const currentName = `${user.firstName} ${user.lastName}`.trim() || user.email;
    if (options.some((opt) => opt.id === user.id)) return options;
    return [{ id: user.id, name: currentName }, ...options];
  }, [lookups.users, user]);

  const shareholdingChart = useMemo(() => {
    const colors = ['#0284c7', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];
    const entries = asset?.shareholdings ?? [];
    const total = entries.reduce((acc, row) => acc + Number(row.ownershipPercent), 0);
    if (!entries.length || total <= 0) {
      return [] as Array<{ id: string; color: string; value: number; offset: number }>;
    }

    let cursor = 0;
    return entries.map((row, idx) => {
      const value = Number(row.ownershipPercent);
      const pct = value / total;
      const slice = {
        id: row.id,
        color: colors[idx % colors.length],
        value: pct,
        offset: cursor,
      };
      cursor += pct;
      return slice;
    });
  }, [asset?.shareholdings]);

  const updateOverviewMutation = useMutation({
    mutationFn: () => {
      if (overviewForm.managedByUserId && overviewForm.managedByCompanyId) {
        throw new Error('Provide either managedByUser or managedByCompany, not both.');
      }
      return updatePropertyAsset(String(id), {
        addressLine1: overviewForm.addressLine1,
        city: overviewForm.city,
        postCode: overviewForm.postCode,
        country: overviewForm.country,
        ownerId: overviewForm.ownerId || undefined,
        managedByUserId: overviewForm.managedByUserId || null,
        managedByCompanyId: overviewForm.managedByCompanyId || null,
        ownershipTypeId: overviewForm.ownershipTypeId || undefined,
        propertyPurposeId: overviewForm.propertyPurposeId || undefined,
        purchaseDate: overviewForm.purchaseDate ? new Date(overviewForm.purchaseDate).toISOString() : undefined,
        purchasePrice: overviewForm.purchasePrice ? Number(overviewForm.purchasePrice) : undefined,
        depositPaid: overviewForm.depositPaid ? Number(overviewForm.depositPaid) : undefined,
        dutiesTaxes: overviewForm.dutiesTaxes ? Number(overviewForm.dutiesTaxes) : undefined,
        legalFees: overviewForm.legalFees ? Number(overviewForm.legalFees) : undefined,
        description: overviewForm.description || undefined,
      }, requireAccessToken(accessToken));
    },
    onSuccess: () => {
      setOverviewError(null);
      setShowEditOverview(false);
      queryClient.invalidateQueries({ queryKey: ['asset-detail', id] });
    },
    onError: (err) => {
      setOverviewError(err instanceof Error ? err.message : 'Failed to save updates');
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

  const updatePurchaseMutation = useMutation({
    mutationFn: () => updatePropertyAsset(String(id), {
      purchaseDate: purchaseForm.purchaseDate ? new Date(purchaseForm.purchaseDate).toISOString() : undefined,
      purchasePrice: purchaseForm.purchasePrice ? Number(purchaseForm.purchasePrice) : undefined,
      depositPaid: purchaseForm.depositPaid ? Number(purchaseForm.depositPaid) : undefined,
      dutiesTaxes: purchaseForm.dutiesTaxes ? Number(purchaseForm.dutiesTaxes) : undefined,
      legalFees: purchaseForm.legalFees ? Number(purchaseForm.legalFees) : undefined,
      isFinanced: purchaseForm.isFinanced,
    }, requireAccessToken(accessToken)),
    onSuccess: () => {
      setShowEditPurchase(false);
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
    <div className="space-y-6 px-4 py-6">
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
            {overviewError && <p className="text-xs text-red-600 dark:text-red-400">{overviewError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.addressLine1} onChange={(e) => setOverviewForm((s) => ({ ...s, addressLine1: e.target.value }))} placeholder="Address line 1" />
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.city} onChange={(e) => setOverviewForm((s) => ({ ...s, city: e.target.value }))} placeholder="City" />
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.postCode} onChange={(e) => setOverviewForm((s) => ({ ...s, postCode: e.target.value }))} placeholder="Post code" />
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.country} onChange={(e) => setOverviewForm((s) => ({ ...s, country: e.target.value }))} placeholder="Country" />
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.ownershipTypeId} onChange={(e) => setOverviewForm((s) => ({ ...s, ownershipTypeId: e.target.value }))}>
                <option value="">Ownership type</option>
                {lookups.ownershipTypes.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
              </select>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.propertyPurposeId} onChange={(e) => setOverviewForm((s) => ({ ...s, propertyPurposeId: e.target.value }))}>
                <option value="">Property purpose</option>
                {lookups.propertyPurposes.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
              </select>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.ownerId} onChange={(e) => setOverviewForm((s) => ({ ...s, ownerId: e.target.value }))}>
                <option value="">— Select owner —</option>
                {userOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
              </select>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.managedByUserId} onChange={(e) => setOverviewForm((s) => ({ ...s, managedByUserId: e.target.value, managedByCompanyId: '' }))}>
                <option value="">Managed by user</option>
                {userOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
              </select>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.managedByCompanyId} onChange={(e) => setOverviewForm((s) => ({ ...s, managedByCompanyId: e.target.value, managedByUserId: '' }))}>
                <option value="">Managed by company</option>
                {lookups.companies.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
              </select>
              <input type="date" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900" value={overviewForm.purchaseDate} onChange={(e) => setOverviewForm((s) => ({ ...s, purchaseDate: e.target.value }))} placeholder="Purchase date" />
              <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                <input type="number" step="0.01" min="0" className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" value={overviewForm.purchasePrice} onChange={(e) => setOverviewForm((s) => ({ ...s, purchasePrice: e.target.value }))} placeholder="Purchase price" />
              </div>
              <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                <input type="number" step="0.01" min="0" className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" value={overviewForm.depositPaid} onChange={(e) => setOverviewForm((s) => ({ ...s, depositPaid: e.target.value }))} placeholder="Deposit paid" />
              </div>
              <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                <input type="number" step="0.01" min="0" className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" value={overviewForm.dutiesTaxes} onChange={(e) => setOverviewForm((s) => ({ ...s, dutiesTaxes: e.target.value }))} placeholder="Duties / taxes" />
              </div>
              <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                <input type="number" step="0.01" min="0" className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" value={overviewForm.legalFees} onChange={(e) => setOverviewForm((s) => ({ ...s, legalFees: e.target.value }))} placeholder="Legal fees" />
              </div>
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
                <p className="text-2xl font-semibold text-sky-800 dark:text-sky-200 mt-1">{latestValuation ? formatCurrency(latestValuation.valuationAmount) : 'No valuation yet'}</p>
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
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-700 dark:text-gray-200">Purchase Info</p>
                  {canEditOrDelete && (
                    <button type="button" onClick={() => setShowEditPurchase((v) => !v)} className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline">
                      <PencilSquareIcon className="h-4 w-4" /> Edit
                    </button>
                  )}
                </div>
                <p className="mt-1">Date: {asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString('en-GB') : 'N/A'}</p>
                <p>Price: {formatCurrency(asset.purchasePrice)}</p>
                <p>Deposit Paid: {formatCurrency(asset.depositPaid)}</p>
                <p>Duties / Taxes: {formatCurrency(asset.dutiesTaxes)}</p>
                <p>Legal Fees: {formatCurrency(asset.legalFees)}</p>
                <p>Financed: {asset.isFinanced ? 'Yes' : 'No'}</p>

                {showEditPurchase && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input type="date" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" value={purchaseForm.purchaseDate} onChange={(e) => setPurchaseForm((s) => ({ ...s, purchaseDate: e.target.value }))} />
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                      <span className="flex select-none items-center pl-2 text-gray-500 dark:text-gray-400 text-xs">£</span>
                      <input type="number" step="0.01" min="0" className="block flex-1 border-0 bg-transparent py-1.5 pl-1 pr-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" placeholder="Price" value={purchaseForm.purchasePrice} onChange={(e) => setPurchaseForm((s) => ({ ...s, purchasePrice: e.target.value }))} />
                    </div>
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                      <span className="flex select-none items-center pl-2 text-gray-500 dark:text-gray-400 text-xs">£</span>
                      <input type="number" step="0.01" min="0" className="block flex-1 border-0 bg-transparent py-1.5 pl-1 pr-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" placeholder="Deposit Paid" value={purchaseForm.depositPaid} onChange={(e) => setPurchaseForm((s) => ({ ...s, depositPaid: e.target.value }))} />
                    </div>
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                      <span className="flex select-none items-center pl-2 text-gray-500 dark:text-gray-400 text-xs">£</span>
                      <input type="number" step="0.01" min="0" className="block flex-1 border-0 bg-transparent py-1.5 pl-1 pr-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" placeholder="Duties / Taxes" value={purchaseForm.dutiesTaxes} onChange={(e) => setPurchaseForm((s) => ({ ...s, dutiesTaxes: e.target.value }))} />
                    </div>
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                      <span className="flex select-none items-center pl-2 text-gray-500 dark:text-gray-400 text-xs">£</span>
                      <input type="number" step="0.01" min="0" className="block flex-1 border-0 bg-transparent py-1.5 pl-1 pr-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" placeholder="Legal Fees" value={purchaseForm.legalFees} onChange={(e) => setPurchaseForm((s) => ({ ...s, legalFees: e.target.value }))} />
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <input type="checkbox" checked={purchaseForm.isFinanced} onChange={(e) => setPurchaseForm((s) => ({ ...s, isFinanced: e.target.checked }))} />
                      Financed
                    </label>
                    <div className="sm:col-span-2 flex justify-end gap-2">
                      <button type="button" className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600" onClick={() => setShowEditPurchase(false)}>Cancel</button>
                      <button type="button" className="px-2 py-1 text-xs rounded bg-sky-600 text-white" onClick={() => updatePurchaseMutation.mutate()} disabled={updatePurchaseMutation.isPending}>Save purchase info</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-700 dark:text-gray-200">Valuation History</p>
                  <button type="button" onClick={() => setShowValuationForm((v) => !v)} className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"><PlusIcon className="h-4 w-4" /> Add</button>
                </div>
                {showValuationForm && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input type="date" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" onChange={(e) => setValuationForm((s) => ({ ...s, valuationDate: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                      <span className="flex select-none items-center pl-2 text-gray-500 dark:text-gray-400 text-xs">£</span>
                      <input type="number" className="block flex-1 border-0 bg-transparent py-1.5 pl-1 pr-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" placeholder="Amount" onChange={(e) => setValuationForm((s) => ({ ...s, valuationAmount: Number(e.target.value) }))} />
                    </div>
                    <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Method" onChange={(e) => setValuationForm((s) => ({ ...s, valuationMethod: e.target.value }))} />
                    <button type="button" className="sm:col-span-3 rounded bg-sky-600 text-white px-3 py-1.5" onClick={() => createValuationMutation.mutate()} disabled={createValuationMutation.isPending}>Save valuation</button>
                  </div>
                )}
                {asset.valuations.length === 0 && <p className="mt-2 text-gray-500 dark:text-gray-400">No valuation entries.</p>}
                {asset.valuations.length > 0 && (
                  <div className="mt-2 overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-2 py-1 text-left">Date</th>
                          <th className="px-2 py-1 text-left">Amount</th>
                          <th className="px-2 py-1 text-left">Method</th>
                          <th className="px-2 py-1 text-left">Valued By</th>
                          <th className="px-2 py-1 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asset.valuations.map((v) => (
                          <tr key={v.id} className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-2 py-1">{new Date(v.valuationDate).toLocaleDateString('en-GB')}</td>
                            <td className="px-2 py-1">{formatCurrency(v.valuationAmount)}</td>
                            <td className="px-2 py-1">{v.valuationMethod}</td>
                            <td className="px-2 py-1">{v.valuedBy ?? 'N/A'}</td>
                            <td className="px-2 py-1">{v.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-700 dark:text-gray-200">Mortgage History</p>
                  <button type="button" onClick={() => setShowMortgageForm((v) => !v)} className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"><PlusIcon className="h-4 w-4" /> Add</button>
                </div>
                {showMortgageForm && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Lender" onChange={(e) => setMortgageForm((s) => ({ ...s, lender: e.target.value }))} />
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-900">
                      <span className="flex select-none items-center pl-2 text-gray-500 dark:text-gray-400 text-xs">£</span>
                      <input type="number" className="block flex-1 border-0 bg-transparent py-1.5 pl-1 pr-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" placeholder="Loan amount" onChange={(e) => setMortgageForm((s) => ({ ...s, loanAmount: Number(e.target.value) }))} />
                    </div>
                    <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Mortgage type ID" onChange={(e) => setMortgageForm((s) => ({ ...s, mortgageTypeId: e.target.value }))} />
                    <input className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" placeholder="Payment status ID" onChange={(e) => setMortgageForm((s) => ({ ...s, paymentStatusId: e.target.value }))} />
                    <input type="date" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-900" onChange={(e) => setMortgageForm((s) => ({ ...s, startDate: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
                    <button type="button" className="rounded bg-sky-600 text-white px-3 py-1.5" onClick={() => createMortgageMutation.mutate()} disabled={createMortgageMutation.isPending}>Save mortgage</button>
                  </div>
                )}
                {asset.mortgages.length === 0 && <p className="mt-1 text-gray-500 dark:text-gray-400">No mortgage entries.</p>}
                {asset.mortgages.length > 0 && (
                  <div className="mt-2 overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-2 py-1 text-left">Lender</th>
                          <th className="px-2 py-1 text-left">Product</th>
                          <th className="px-2 py-1 text-left">Loan</th>
                          <th className="px-2 py-1 text-left">Rate</th>
                          <th className="px-2 py-1 text-left">Term</th>
                          <th className="px-2 py-1 text-left">Start</th>
                          <th className="px-2 py-1 text-left">Settled</th>
                          <th className="px-2 py-1 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asset.mortgages.map((m) => (
                          <tr key={m.id} className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-2 py-1">{m.lender}</td>
                            <td className="px-2 py-1">{m.productName ?? 'N/A'}</td>
                            <td className="px-2 py-1">{formatCurrency(m.loanAmount)}</td>
                            <td className="px-2 py-1">{m.interestRate === null || m.interestRate === undefined ? 'N/A' : `${Number(m.interestRate).toFixed(2)}%`}</td>
                            <td className="px-2 py-1">{m.termYears ?? 'N/A'}</td>
                            <td className="px-2 py-1">{new Date(m.startDate).toLocaleDateString('en-GB')}</td>
                            <td className="px-2 py-1">{m.settledAt ? new Date(m.settledAt).toLocaleDateString('en-GB') : '—'}</td>
                            <td className="px-2 py-1">
                              <span className={`text-xs rounded-full px-2 py-0.5 ${m.settledAt ? 'bg-gray-100 dark:bg-gray-800' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'}`}>
                                {m.settledAt ? 'Settled' : 'Active'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
              {asset.shareholdings.length > 0 && (
                <>
                  <div className="mt-2 overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-2 py-1 text-left">Shareholder</th>
                          <th className="px-2 py-1 text-left">Ownership %</th>
                          <th className="px-2 py-1 text-left">Profit %</th>
                          <th className="px-2 py-1 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asset.shareholdings.map((s) => (
                          <tr key={s.id} className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-2 py-1">{s.shareholderName}</td>
                            <td className="px-2 py-1">{Number(s.ownershipPercent).toFixed(2)}%</td>
                            <td className="px-2 py-1">{Number(s.profitPercent).toFixed(2)}%</td>
                            <td className="px-2 py-1">{s.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 rounded border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-3">Ownership Pie Chart</p>
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                      <svg width="180" height="180" viewBox="0 0 42 42" className="-rotate-90">
                        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e5e7eb" strokeWidth="6" />
                        {shareholdingChart.map((slice) => (
                          <circle
                            key={slice.id}
                            cx="21"
                            cy="21"
                            r="15.915"
                            fill="transparent"
                            stroke={slice.color}
                            strokeWidth="6"
                            strokeDasharray={`${slice.value * 100} ${100 - slice.value * 100}`}
                            strokeDashoffset={-slice.offset * 100}
                          />
                        ))}
                      </svg>
                      <div className="space-y-1 text-xs">
                        {asset.shareholdings.map((row, idx) => (
                          <div key={row.id} className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: shareholdingChart[idx]?.color ?? '#9ca3af' }} />
                            <span>{row.shareholderName}</span>
                            <span className="text-gray-500 dark:text-gray-400">{Number(row.ownershipPercent).toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
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
                <p key={t.id} className="py-1">{new Date(t.date).toLocaleDateString('en-GB')} - {t.description} - {formatCurrency(t.amount)}</p>
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
