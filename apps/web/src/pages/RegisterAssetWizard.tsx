import { useState } from 'react';
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

function toIsoDate(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function hasUnsavedData(state: WizardState): boolean {
  return Boolean(
    state.basic.customAlias ||
      state.basic.ownershipTypeId ||
      state.basic.addressLine1 ||
      state.info.propertyPurposeId ||
      state.purchase.purchasePrice ||
      state.shareholdings.length ||
      state.valuations.length ||
      state.mortgages.length,
  );
}

function buildPayload(state: WizardState): CreatePropertyAssetPayload {
  return {
    customAlias: state.basic.customAlias || undefined,
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
    isFinanced: state.purchase.isFinanced || undefined,
    shareholdings: state.shareholdings.length ? state.shareholdings : undefined,
    valuations: state.valuations.length ? state.valuations : undefined,
    mortgages: state.mortgages.length ? state.mortgages : undefined,
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [error, setError] = useState<string | null>(null);

  const lookups = useWizardLookups(requireAccessToken(accessToken));

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
      const total = state.shareholdings.reduce((acc, item) => acc + item.ownershipPercent, 0);
      if (total !== 100) {
        setError(`Ownership percentages must equal 100 (currently ${total}).`);
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
    <div className="mx-auto max-w-2xl space-y-6">
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
              <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-4">
                <input value={row.ownershipPercent} onChange={(e) => setState((s) => ({ ...s, shareholdings: s.shareholdings.map((item, i) => i === idx ? { ...item, ownershipPercent: parseFloat(e.target.value) || 0 } : item) }))} type="number" className={field} />
                <button type="button" onClick={() => setState((s) => ({ ...s, shareholdings: s.shareholdings.filter((_, i) => i !== idx) }))}>
                  <TrashIcon className="h-4 w-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 4 && <div data-testid="step-valuation">Valuation</div>}
        {step === 5 && <div data-testid="step-mortgage">Mortgage</div>}

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
