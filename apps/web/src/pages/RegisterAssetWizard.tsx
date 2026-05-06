import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../store/authStore';
import {
  createPropertyAsset,
  type CreatePropertyAssetPayload,
  type CreateMortgagePayload,
  type CreateShareholdingPayload,
  type CreateValuationPayload,
} from '../api/assets';
import { useWizardLookups, type LookupOption } from '../hooks/useWizardLookups';

const field =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500';
const label = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

interface BasicDetails {
  customAlias: string;
  ownershipTypeId: string;
  ownerId: string;
  managedByUserId: string;
  managedByCompanyId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  postCode: string;
  country: string;
}

interface PropertyInfo {
  propertyPurposeId: string;
  propertyStatusId: string;
  description: string;
  assetClassId: string;
}

interface PurchaseDetails {
  purchaseDate: string;
  purchasePrice: string;
  depositPaid: string;
  dutiesTaxes: string;
  legalFees: string;
  isFinanced: boolean;
}

interface WizardState {
  basic: BasicDetails;
  info: PropertyInfo;
  purchase: PurchaseDetails;
  shareholdings: CreateShareholdingPayload[];
  valuations: CreateValuationPayload[];
  mortgages: CreateMortgagePayload[];
}

const INITIAL: WizardState = {
  basic: {
    customAlias: '',
    ownershipTypeId: '',
    ownerId: '',
    managedByUserId: '',
    managedByCompanyId: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    county: '',
    postCode: '',
    country: 'United Kingdom',
  },
  info: {
    propertyPurposeId: '',
    propertyStatusId: '',
    description: '',
    assetClassId: '',
  },
  purchase: {
    purchaseDate: '',
    purchasePrice: '',
    depositPaid: '',
    dutiesTaxes: '',
    legalFees: '',
    isFinanced: false,
  },
  shareholdings: [],
  valuations: [],
  mortgages: [],
};

const STEP_LABELS = ['Basic Details', 'Property Info', 'Purchase Details', 'Shareholding', 'Valuation', 'Mortgage', 'Review'];

function requireAccessToken(token: string | null): string {
  if (!token) throw new Error('Not authenticated');
  return token;
}

function parseMoney(value: string): number | undefined {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function hasUnsavedData(state: WizardState): boolean {
  return Boolean(
    state.basic.customAlias ||
      state.basic.ownershipTypeId ||
      state.basic.addressLine1 ||
      state.basic.ownerId ||
      state.basic.managedByUserId ||
      state.basic.managedByCompanyId ||
      state.info.propertyPurposeId ||
      state.purchase.purchasePrice ||
      state.purchase.purchaseDate ||
      state.purchase.depositPaid ||
      state.purchase.dutiesTaxes ||
      state.purchase.legalFees ||
      state.shareholdings.length ||
      state.valuations.length ||
      state.mortgages.length,
  );
}

function buildPayload(state: WizardState): CreatePropertyAssetPayload {
  return {
    customAlias: state.basic.customAlias || undefined,
    ownerId: state.basic.ownerId || undefined,
    managedByUserId: state.basic.managedByUserId || undefined,
    managedByCompanyId: state.basic.managedByCompanyId || undefined,
    ownershipTypeId: state.basic.ownershipTypeId,
    addressLine1: state.basic.addressLine1,
    addressLine2: state.basic.addressLine2 || undefined,
    city: state.basic.city,
    county: state.basic.county || undefined,
    postCode: state.basic.postCode,
    country: state.basic.country,
    propertyPurposeId: state.info.propertyPurposeId,
    propertyStatusId: state.info.propertyStatusId,
    description: state.info.description || undefined,
    assetClassId: state.info.assetClassId || undefined,
    purchaseDate: toIsoDate(state.purchase.purchaseDate),
    purchasePrice: parseMoney(state.purchase.purchasePrice),
    depositPaid: parseMoney(state.purchase.depositPaid),
    dutiesTaxes: parseMoney(state.purchase.dutiesTaxes),
    legalFees: parseMoney(state.purchase.legalFees),
    isFinanced: state.purchase.isFinanced || undefined,
    shareholdings: state.shareholdings.length
      ? state.shareholdings.map((s) => ({
          shareholderName: s.shareholderName.trim(),
          ownershipPercent: s.ownershipPercent,
          profitPercent: s.profitPercent,
          notes: s.notes || undefined,
        }))
      : undefined,
    valuations: state.valuations.length
      ? state.valuations.map((v) => ({
          valuationDate: toIsoDate(v.valuationDate) as string,
          valuationAmount: v.valuationAmount,
          valuationMethod: v.valuationMethod.trim(),
          valuedBy: v.valuedBy || undefined,
          notes: v.notes || undefined,
        }))
      : undefined,
    mortgages: state.mortgages.length
      ? state.mortgages.map((m) => ({
          lender: m.lender.trim(),
          productName: m.productName || undefined,
          mortgageTypeId: m.mortgageTypeId,
          loanAmount: m.loanAmount,
          interestRate: m.interestRate,
          termYears: m.termYears,
          paymentStatusId: m.paymentStatusId,
          startDate: toIsoDate(m.startDate) as string,
          settledAt: toIsoDate(m.settledAt || ''),
          notes: m.notes || undefined,
        }))
      : undefined,
  };
}

function lookup(options: LookupOption[], id: string): string {
  return options.find((o) => o.id === id)?.name ?? '—';
}

function StepIndicator({ current, financed }: { current: number; financed: boolean }) {
  const visible = STEP_LABELS.filter((_, idx) => idx !== 5 || financed);
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Progress">
      {visible.map((step, idx) => {
        const real = STEP_LABELS.indexOf(step);
        const done = real < current;
        const active = real === current;
        return (
          <li key={step} className="flex items-center gap-1">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-sky-600 text-white' : active ? 'bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 ring-2 ring-sky-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
              {done ? <CheckIcon className="h-4 w-4" /> : idx + 1}
            </span>
            <span className={`hidden sm:block text-xs ${active ? 'font-semibold text-sky-700 dark:text-sky-300' : 'text-gray-500 dark:text-gray-400'}`}>
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function RegisterAssetWizard() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [error, setError] = useState<string | null>(null);

  const lookups = useWizardLookups(requireAccessToken(accessToken));

  const userOptions = useMemo(() => {
    const base = lookups.users;
    if (!user) return base;
    const fullName = `${user.firstName} ${user.lastName}`.trim() || user.email;
    const hasCurrent = base.some((opt) => opt.id === user.id);
    return hasCurrent ? base : [{ id: user.id, name: fullName }, ...base];
  }, [lookups.users, user]);

  useEffect(() => {
    if (!user) return;
    setState((s) => (s.basic.managedByUserId ? s : {
      ...s,
      basic: {
        ...s.basic,
        managedByUserId: user.id,
      },
    }));
  }, [user?.id]);

  const mutation = useMutation({
    mutationFn: (payload: CreatePropertyAssetPayload) => createPropertyAsset(payload, requireAccessToken(accessToken)),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      navigate(`/assets/${res.asset.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Submission failed');
    },
  });

  function validateStep(): boolean {
    if (step === 0) {
      if (!state.basic.ownershipTypeId || !state.basic.addressLine1 || !state.basic.city || !state.basic.postCode || !state.basic.country) {
        setError('Please complete all required fields in Basic Details.');
        return false;
      }
      if (state.basic.managedByUserId && state.basic.managedByCompanyId) {
        setError('Choose either a managing user or a managing company, not both.');
        return false;
      }
      if (state.basic.customAlias && !/^[A-Za-z0-9_-]+$/.test(state.basic.customAlias)) {
        setError('Only letters, digits, hyphens and underscores allowed for alias.');
        return false;
      }
    }
    if (step === 1) {
      if (!state.info.propertyPurposeId || !state.info.propertyStatusId) {
        setError('Please complete all required fields in Property Info.');
        return false;
      }
    }
    if (step === 3 && state.shareholdings.length > 0) {
      const hasInvalidRow = state.shareholdings.some((row) => !row.shareholderName.trim());
      if (hasInvalidRow) {
        setError('Each shareholding entry must include shareholder name.');
        return false;
      }
      const total = state.shareholdings.reduce((acc, item) => acc + item.ownershipPercent, 0);
      if (total !== 100) {
        setError(`Ownership percentages must equal 100 (currently ${total}).`);
        return false;
      }
    }
    if (step === 4 && state.valuations.length > 0) {
      const hasInvalidValuation = state.valuations.some((v) => !v.valuationDate || !v.valuationMethod.trim() || v.valuationAmount <= 0);
      if (hasInvalidValuation) {
        setError('Each valuation must include date, amount greater than 0, and valuation method.');
        return false;
      }
    }
    if (step === 5 && state.mortgages.length > 0) {
      const hasInvalidMortgage = state.mortgages.some(
        (m) => !m.lender.trim() || !m.mortgageTypeId || !m.paymentStatusId || !m.startDate || m.loanAmount <= 0,
      );
      if (hasInvalidMortgage) {
        setError('Each mortgage must include lender, mortgage type, payment status, start date, and loan amount greater than 0.');
        return false;
      }
    }
    setError(null);
    return true;
  }

  function onNext() {
    if (!validateStep()) return;
    if (!state.purchase.isFinanced && step === 4) {
      setStep(6);
      return;
    }
    setStep((s) => Math.min(s + 1, 6));
  }

  function onBack() {
    if (!state.purchase.isFinanced && step === 6) {
      setStep(4);
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  }

  function onCancel() {
    if (hasUnsavedData(state) && !window.confirm('You have unsaved data. Leave without registering?')) {
      return;
    }
    navigate('/assets');
  }

  function onSubmit() {
    if (!validateStep()) return;
    mutation.mutate(buildPayload(state));
  }

  if (lookups.isLoading) {
    return <p role="status" className="py-20 text-center text-sm text-gray-500 dark:text-gray-400">Loading form data…</p>;
  }

  if (lookups.isError) {
    return <p className="py-20 text-center text-sm text-red-600 dark:text-red-400">Failed to load form options. Please refresh and try again.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Register New Property Asset</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Complete each step to register a new property.</p>
      </div>

      <StepIndicator current={step} financed={state.purchase.isFinanced} />

      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {step === 0 && (
          <div className="space-y-4" data-testid="step-basic">
            <p className="text-base font-semibold text-gray-800 dark:text-white">Basic Details</p>
            <div>
              <label htmlFor="customAlias" className={label}>Property Alias</label>
              <input id="customAlias" placeholder="e.g. my-london-flat" value={state.basic.customAlias} onChange={(e) => setState((s) => ({ ...s, basic: { ...s.basic, customAlias: e.target.value } }))} className={field} />
            </div>
            <div>
              <label htmlFor="ownershipTypeId" className={label}>Ownership Type *</label>
              <select id="ownershipTypeId" value={state.basic.ownershipTypeId} onChange={(e) => setState((s) => ({ ...s, basic: { ...s.basic, ownershipTypeId: e.target.value } }))} className={field}>
                <option value="">— Select —</option>
                {lookups.ownershipTypes.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ownerId" className={label}>Asset Owner</label>
                <select id="ownerId" value={state.basic.ownerId} onChange={(e) => setState((s) => ({ ...s, basic: { ...s.basic, ownerId: e.target.value } }))} className={field}>
                  <option value="">— Select owner —</option>
                  {userOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="managedByUserId" className={label}>Asset Manager (User)</label>
                <select
                  id="managedByUserId"
                  value={state.basic.managedByUserId}
                  onChange={(e) => setState((s) => ({
                    ...s,
                    basic: { ...s.basic, managedByUserId: e.target.value, managedByCompanyId: '' },
                  }))}
                  className={field}
                >
                  <option value="">— Select user —</option>
                  {userOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="managedByCompanyId" className={label}>Asset Manager (Company)</label>
                <select
                  id="managedByCompanyId"
                  value={state.basic.managedByCompanyId}
                  onChange={(e) => setState((s) => ({
                    ...s,
                    basic: { ...s.basic, managedByCompanyId: e.target.value, managedByUserId: '' },
                  }))}
                  className={field}
                >
                  <option value="">— Select asset manager company —</option>
                  {lookups.companies.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Choose either user or company manager.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="addressLine1" className={label}>Address Line 1 *</label>
                <input id="addressLine1" value={state.basic.addressLine1} onChange={(e) => setState((s) => ({ ...s, basic: { ...s.basic, addressLine1: e.target.value } }))} className={field} />
              </div>
              <div>
                <label htmlFor="city" className={label}>City *</label>
                <input id="city" value={state.basic.city} onChange={(e) => setState((s) => ({ ...s, basic: { ...s.basic, city: e.target.value } }))} className={field} />
              </div>
              <div>
                <label htmlFor="postCode" className={label}>Post Code *</label>
                <input id="postCode" value={state.basic.postCode} onChange={(e) => setState((s) => ({ ...s, basic: { ...s.basic, postCode: e.target.value } }))} className={field} />
              </div>
              <div>
                <label htmlFor="country" className={label}>Country *</label>
                <input id="country" value={state.basic.country} onChange={(e) => setState((s) => ({ ...s, basic: { ...s.basic, country: e.target.value } }))} className={field} />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4" data-testid="step-info">
            <p className="text-base font-semibold text-gray-800 dark:text-white">Property Info</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="propertyPurposeId" className={label}>Property Purpose *</label>
                <select id="propertyPurposeId" value={state.info.propertyPurposeId} onChange={(e) => setState((s) => ({ ...s, info: { ...s.info, propertyPurposeId: e.target.value } }))} className={field}>
                  <option value="">— Select —</option>
                  {lookups.propertyPurposes.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="propertyStatusId" className={label}>Property Status *</label>
                <select id="propertyStatusId" value={state.info.propertyStatusId} onChange={(e) => setState((s) => ({ ...s, info: { ...s.info, propertyStatusId: e.target.value } }))} className={field}>
                  <option value="">— Select —</option>
                  {lookups.propertyStatuses.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="description" className={label}>Description</label>
                <textarea id="description" value={state.info.description} onChange={(e) => setState((s) => ({ ...s, info: { ...s.info, description: e.target.value } }))} className={field} rows={3} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4" data-testid="step-purchase">
            <p className="text-base font-semibold text-gray-800 dark:text-white">Purchase Details</p>
            <div>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={state.purchase.isFinanced} onChange={(e) => setState((s) => ({ ...s, purchase: { ...s.purchase, isFinanced: e.target.checked } }))} className="h-4 w-4 accent-sky-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Property is financed (mortgage)</span>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="purchaseDate" className={label}>Purchase Date</label>
                <input id="purchaseDate" type="date" value={state.purchase.purchaseDate} onChange={(e) => setState((s) => ({ ...s, purchase: { ...s.purchase, purchaseDate: e.target.value } }))} className={field} />
              </div>
              <div>
                <label htmlFor="purchasePrice" className={label}>Purchase Price</label>
                <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-800">
                  <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                  <input id="purchasePrice" type="number" min="0" step="0.01" value={state.purchase.purchasePrice} onChange={(e) => setState((s) => ({ ...s, purchase: { ...s.purchase, purchasePrice: e.target.value } }))} className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="depositPaid" className={label}>Deposit Paid</label>
                <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-800">
                  <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                  <input id="depositPaid" type="number" min="0" step="0.01" value={state.purchase.depositPaid} onChange={(e) => setState((s) => ({ ...s, purchase: { ...s.purchase, depositPaid: e.target.value } }))} className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="dutiesTaxes" className={label}>Duties / Taxes</label>
                <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-800">
                  <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                  <input id="dutiesTaxes" type="number" min="0" step="0.01" value={state.purchase.dutiesTaxes} onChange={(e) => setState((s) => ({ ...s, purchase: { ...s.purchase, dutiesTaxes: e.target.value } }))} className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="legalFees" className={label}>Legal Fees</label>
                <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-800">
                  <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                  <input id="legalFees" type="number" min="0" step="0.01" value={state.purchase.legalFees} onChange={(e) => setState((s) => ({ ...s, purchase: { ...s.purchase, legalFees: e.target.value } }))} className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none" />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4" data-testid="step-shareholding">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-gray-800 dark:text-white">Shareholding</p>
              <button type="button" onClick={() => setState((s) => ({ ...s, shareholdings: [...s.shareholdings, { shareholderName: '', ownershipPercent: 0, profitPercent: 0, notes: '' }] }))} className="flex items-center gap-1 text-sm text-sky-600 hover:underline dark:text-sky-400">
                <PlusIcon className="h-4 w-4" /> Add entry
              </button>
            </div>
            {state.shareholdings.map((row, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    aria-label={`Shareholder Name ${idx + 1}`}
                    placeholder="Shareholder name"
                    value={row.shareholderName}
                    onChange={(e) => setState((s) => ({ ...s, shareholdings: s.shareholdings.map((item, i) => i === idx ? { ...item, shareholderName: e.target.value } : item) }))}
                    className={field}
                  />
                  <input
                    aria-label={`Ownership Percent ${idx + 1}`}
                    value={row.ownershipPercent}
                    onChange={(e) => setState((s) => ({ ...s, shareholdings: s.shareholdings.map((item, i) => i === idx ? { ...item, ownershipPercent: parseNumber(e.target.value) } : item) }))}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className={field}
                  />
                  <input
                    aria-label={`Profit Percent ${idx + 1}`}
                    value={row.profitPercent}
                    onChange={(e) => setState((s) => ({ ...s, shareholdings: s.shareholdings.map((item, i) => i === idx ? { ...item, profitPercent: parseNumber(e.target.value) } : item) }))}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className={field}
                  />
                </div>
                <textarea
                  aria-label={`Shareholding Notes ${idx + 1}`}
                  placeholder="Notes"
                  value={row.notes ?? ''}
                  onChange={(e) => setState((s) => ({ ...s, shareholdings: s.shareholdings.map((item, i) => i === idx ? { ...item, notes: e.target.value } : item) }))}
                  className={field}
                  rows={2}
                />
                <button type="button" onClick={() => setState((s) => ({ ...s, shareholdings: s.shareholdings.filter((_, i) => i !== idx) }))}>
                  <TrashIcon className="h-4 w-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4" data-testid="step-valuation">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-gray-800 dark:text-white">Valuation</p>
              <button
                type="button"
                onClick={() => setState((s) => ({
                  ...s,
                  valuations: [...s.valuations, { valuationDate: '', valuationAmount: 0, valuationMethod: '', valuedBy: '', notes: '' }],
                }))}
                className="flex items-center gap-1 text-sm text-sky-600 hover:underline dark:text-sky-400"
              >
                <PlusIcon className="h-4 w-4" /> Add entry
              </button>
            </div>
            {state.valuations.map((row, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    aria-label={`Valuation Date ${idx + 1}`}
                    type="date"
                    value={row.valuationDate.slice(0, 10)}
                    onChange={(e) => setState((s) => ({ ...s, valuations: s.valuations.map((item, i) => i === idx ? { ...item, valuationDate: e.target.value } : item) }))}
                    className={field}
                  />
                  <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-800">
                    <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                    <input
                      aria-label={`Valuation Amount ${idx + 1}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.valuationAmount}
                      onChange={(e) => setState((s) => ({ ...s, valuations: s.valuations.map((item, i) => i === idx ? { ...item, valuationAmount: parseNumber(e.target.value) } : item) }))}
                      className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none"
                    />
                  </div>
                  <input
                    aria-label={`Valuation Method ${idx + 1}`}
                    placeholder="Valuation method"
                    value={row.valuationMethod}
                    onChange={(e) => setState((s) => ({ ...s, valuations: s.valuations.map((item, i) => i === idx ? { ...item, valuationMethod: e.target.value } : item) }))}
                    className={field}
                  />
                </div>
                <input
                  aria-label={`Valued By ${idx + 1}`}
                  placeholder="Valued by"
                  value={row.valuedBy ?? ''}
                  onChange={(e) => setState((s) => ({ ...s, valuations: s.valuations.map((item, i) => i === idx ? { ...item, valuedBy: e.target.value } : item) }))}
                  className={field}
                />
                <textarea
                  aria-label={`Valuation Notes ${idx + 1}`}
                  placeholder="Notes"
                  value={row.notes ?? ''}
                  onChange={(e) => setState((s) => ({ ...s, valuations: s.valuations.map((item, i) => i === idx ? { ...item, notes: e.target.value } : item) }))}
                  className={field}
                  rows={2}
                />
                <button type="button" onClick={() => setState((s) => ({ ...s, valuations: s.valuations.filter((_, i) => i !== idx) }))}>
                  <TrashIcon className="h-4 w-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4" data-testid="step-mortgage">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-gray-800 dark:text-white">Mortgage</p>
              <button
                type="button"
                onClick={() => setState((s) => ({
                  ...s,
                  mortgages: [
                    ...s.mortgages,
                    {
                      lender: '',
                      productName: '',
                      mortgageTypeId: '',
                      loanAmount: 0,
                      interestRate: undefined,
                      termYears: undefined,
                      paymentStatusId: '',
                      startDate: '',
                      settledAt: '',
                      notes: '',
                    },
                  ],
                }))}
                className="flex items-center gap-1 text-sm text-sky-600 hover:underline dark:text-sky-400"
              >
                <PlusIcon className="h-4 w-4" /> Add entry
              </button>
            </div>
            {state.mortgages.map((row, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    aria-label={`Lender ${idx + 1}`}
                    placeholder="Lender"
                    value={row.lender}
                    onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, lender: e.target.value } : item) }))}
                    className={field}
                  />
                  <input
                    aria-label={`Product Name ${idx + 1}`}
                    placeholder="Product name"
                    value={row.productName ?? ''}
                    onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, productName: e.target.value } : item) }))}
                    className={field}
                  />
                  <select
                    aria-label={`Mortgage Type ${idx + 1}`}
                    value={row.mortgageTypeId}
                    onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, mortgageTypeId: e.target.value } : item) }))}
                    className={field}
                  >
                    <option value="">— Select mortgage type —</option>
                    {lookups.mortgageTypes.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Payment Status ${idx + 1}`}
                    value={row.paymentStatusId}
                    onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, paymentStatusId: e.target.value } : item) }))}
                    className={field}
                  >
                    <option value="">— Select payment status —</option>
                    {lookups.mortgagePaymentStatuses.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                  <div className="flex rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-sky-500 bg-white dark:bg-gray-800">
                    <span className="flex select-none items-center pl-3 text-gray-500 dark:text-gray-400 text-sm">£</span>
                    <input
                      aria-label={`Loan Amount ${idx + 1}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.loanAmount}
                      onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, loanAmount: parseNumber(e.target.value) } : item) }))}
                      className="block flex-1 border-0 bg-transparent py-2 pl-1 pr-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 focus:outline-none"
                    />
                  </div>
                  <input
                    aria-label={`Interest Rate ${idx + 1}`}
                    type="number"
                    step="0.0001"
                    min="0"
                    max="100"
                    value={row.interestRate ?? ''}
                    onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, interestRate: e.target.value === '' ? undefined : parseNumber(e.target.value) } : item) }))}
                    className={field}
                  />
                  <input
                    aria-label={`Term Years ${idx + 1}`}
                    type="number"
                    min="1"
                    value={row.termYears ?? ''}
                    onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, termYears: e.target.value === '' ? undefined : Math.floor(parseNumber(e.target.value)) } : item) }))}
                    className={field}
                  />
                  <input
                    aria-label={`Start Date ${idx + 1}`}
                    type="date"
                    value={row.startDate.slice(0, 10)}
                    onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, startDate: e.target.value } : item) }))}
                    className={field}
                  />
                  <input
                    aria-label={`Settled At ${idx + 1}`}
                    type="date"
                    value={row.settledAt?.slice(0, 10) ?? ''}
                    onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, settledAt: e.target.value || undefined } : item) }))}
                    className={field}
                  />
                </div>
                <textarea
                  aria-label={`Mortgage Notes ${idx + 1}`}
                  placeholder="Notes"
                  value={row.notes ?? ''}
                  onChange={(e) => setState((s) => ({ ...s, mortgages: s.mortgages.map((item, i) => i === idx ? { ...item, notes: e.target.value } : item) }))}
                  className={field}
                  rows={2}
                />
                <button type="button" onClick={() => setState((s) => ({ ...s, mortgages: s.mortgages.filter((_, i) => i !== idx) }))}>
                  <TrashIcon className="h-4 w-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-2" data-testid="step-review">
            <p className="text-base font-semibold text-gray-800 dark:text-white">Review & Confirm</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">Purpose: {lookup(lookups.propertyPurposes, state.info.propertyPurposeId)}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">Status: {lookup(lookups.propertyStatuses, state.info.propertyStatusId)}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:underline dark:text-gray-400">Cancel</button>
        <div className="flex gap-3">
          {step > 0 && (
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
              <ChevronLeftIcon className="h-4 w-4" /> Back
            </button>
          )}
          {step < 6 ? (
            <button type="button" onClick={onNext} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
              Next <ChevronRightIcon className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={onSubmit} disabled={mutation.isPending} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
              {mutation.isPending ? 'Registering…' : 'Confirm & Register'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
