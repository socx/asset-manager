import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { requireAccessToken } from '../../lib/utils';
import { ApiResponseError } from '../../api/auth';
import {
  listAdminCompanies,
  createAdminCompany,
  updateAdminCompany,
  deleteAdminCompany,
  listAdminLookupItems,
  type AdminCompany,
  type CompanyPayload,
} from '../../api/admin';
import StepUpModal from '../../components/StepUpModal';

// ── Company form ──────────────────────────────────────────────────────────────

interface CompanyFormProps {
  initial?: AdminCompany | null;
  companyTypes: { id: string; name: string }[];
  onSubmit: (payload: Partial<CompanyPayload>) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

function CompanyForm({ initial, companyTypes, onSubmit, onCancel, saving, error }: CompanyFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [companyTypeId, setCompanyTypeId] = useState(initial?.companyType?.id ?? '');
  const [addressLine1, setAddressLine1] = useState(initial?.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(initial?.addressLine2 ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [county, setCounty] = useState(initial?.county ?? '');
  const [postCode, setPostCode] = useState(initial?.postCode ?? '');
  const [country, setCountry] = useState(initial?.country ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      companyTypeId: companyTypeId || null,
      addressLine1: addressLine1.trim() || undefined,
      addressLine2: addressLine2.trim() || undefined,
      city: city.trim() || undefined,
      county: county.trim() || undefined,
      postCode: postCode.trim() || undefined,
      country: country.trim() || undefined,
    });
  }

  const field = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500';
  const label = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 my-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {initial ? 'Edit Company' : 'New Company'}
        </h2>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={label}>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} className={field} />
          </div>
          <div>
            <label className={label}>Company Type</label>
            <select value={companyTypeId} onChange={(e) => setCompanyTypeId(e.target.value)} className={field}>
              <option value="">— None —</option>
              {companyTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={label}>Address Line 1</label>
              <input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} maxLength={200} className={field} />
            </div>
            <div className="col-span-2">
              <label className={label}>Address Line 2</label>
              <input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} maxLength={200} className={field} />
            </div>
            <div>
              <label className={label}>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} className={field} />
            </div>
            <div>
              <label className={label}>County / State</label>
              <input value={county} onChange={(e) => setCounty(e.target.value)} maxLength={100} className={field} />
            </div>
            <div>
              <label className={label}>Post Code</label>
              <input value={postCode} onChange={(e) => setPostCode(e.target.value)} maxLength={20} className={field} />
            </div>
            <div>
              <label className={label}>Country</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={100} className={field} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-sky-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50"
              
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();



  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editCompany, setEditCompany] = useState<AdminCompany | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminCompany | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'companies', debouncedSearch],
    queryFn: () => listAdminCompanies({ search: debouncedSearch || undefined, limit: 50 }, requireAccessToken(accessToken)),
    enabled: !!accessToken,
  });

  const { data: typesData } = useQuery({
    queryKey: ['admin', 'lookup', 'company_type'],
    queryFn: () => listAdminLookupItems('company_type', requireAccessToken(accessToken)),
    enabled: !!accessToken,
  });
  const companyTypes = (typesData?.items ?? []).filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }));

  function withStepUp(action: () => void) {
    setPendingAction(() => action);
    setStepUpOpen(true);
  }

  function onStepUpSuccess() {
    setStepUpOpen(false);
    pendingAction?.();
    setPendingAction(null);
  }

  const createMutation = useMutation({
    mutationFn: (payload: CompanyPayload) => createAdminCompany(payload, requireAccessToken(accessToken)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
      setShowCreate(false);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof ApiResponseError ? err.message : 'Failed to create company');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CompanyPayload & { isActive: boolean }> }) =>
      updateAdminCompany(id, payload, requireAccessToken(accessToken)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
      setEditCompany(null);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof ApiResponseError ? err.message : 'Failed to update company');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminCompany(id, requireAccessToken(accessToken)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] });
      setDeleteConfirm(null);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof ApiResponseError ? err.message : 'Failed to delete company');
      setDeleteConfirm(null);
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {stepUpOpen && <StepUpModal onSuccess={onStepUpSuccess} onCancel={() => setStepUpOpen(false)} />}

      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => withStepUp(() => { setMutationError(null); setShowCreate(true); })}
          className="bg-sky-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-sky-700"
        >
          + New company
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name…"
          className="w-full max-w-xs border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {mutationError && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {mutationError}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Type</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">City</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Country</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(data?.companies ?? []).map((company) => (
                <tr key={company.id} className="last:border-0">
                  <td className="py-2.5 px-4 text-sm font-medium text-gray-900 dark:text-white">{company.name}</td>
                  <td className="py-2.5 px-4 text-sm text-gray-500 dark:text-gray-400">{company.companyType?.name ?? '—'}</td>
                  <td className="py-2.5 px-4 text-sm text-gray-500 dark:text-gray-400">{company.city ?? '—'}</td>
                  <td className="py-2.5 px-4 text-sm text-gray-500 dark:text-gray-400">{company.country ?? '—'}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      company.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {company.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => withStepUp(() => { setMutationError(null); setEditCompany(company); })}
                        disabled={saving}
                        className="text-xs text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => withStepUp(() => updateMutation.mutate({ id: company.id, payload: { isActive: !company.isActive } }))}
                        disabled={saving}
                        className="text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
                      >
                        {company.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => withStepUp(() => setDeleteConfirm(company))}
                        disabled={saving}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.companies ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-gray-400">No companies found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CompanyForm
          companyTypes={companyTypes}
          onSubmit={(p) => createMutation.mutate(p as CompanyPayload)}
          onCancel={() => setShowCreate(false)}
          saving={createMutation.isPending}
          error={mutationError}
        />
      )}

      {editCompany && (
        <CompanyForm
          initial={editCompany}
          companyTypes={companyTypes}
          onSubmit={(p) => updateMutation.mutate({ id: editCompany.id, payload: p })}
          onCancel={() => setEditCompany(null)}
          saving={updateMutation.isPending}
          error={mutationError}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Deactivate company?</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">{deleteConfirm.name}</span> will be soft-deleted — it will no longer appear in dropdowns but existing references are preserved.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Deactivate'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
