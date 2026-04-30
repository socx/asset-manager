import { useState } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { ApiResponseError } from '../../api/auth';
import {
  listAdminLookupItems,
  createLookupItem,
  updateLookupItem,
  deleteLookupItem,
  type LookupItem,
} from '../../api/admin';
import StepUpModal from '../../components/StepUpModal';

// ── Lookup type metadata ──────────────────────────────────────────────────────

const LOOKUP_TYPES = [
  { key: 'document_type', label: 'Document Types' },
  { key: 'asset_class', label: 'Asset Classes' },
  { key: 'transaction_category', label: 'Transaction Categories' },
  { key: 'company_type', label: 'Company Types' },
  { key: 'property_status', label: 'Property Statuses' },
  { key: 'property_purpose', label: 'Property Purposes' },
  { key: 'ownership_type', label: 'Ownership Types' },
  { key: 'mortgage_type', label: 'Mortgage Types' },
  { key: 'mortgage_payment_status', label: 'Mortgage Payment Statuses' },
] as const;

type LookupTypeKey = (typeof LOOKUP_TYPES)[number]['key'];

// ── Item row ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: LookupItem;
  onEdit: (item: LookupItem) => void;
  onToggle: (item: LookupItem) => void;
  onDelete: (item: LookupItem) => void;
  saving: boolean;
}

function ItemRow({ item, onEdit, onToggle, onDelete, saving }: ItemRowProps) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <td className="py-3 pr-4 text-sm text-gray-900 dark:text-white w-8 tabular-nums text-right">
        {item.sortOrder}
      </td>
      <td className="py-3 pr-4 text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
      <td className="py-3 pr-4 text-sm text-gray-500 dark:text-gray-400">{item.description ?? '—'}</td>
      <td className="py-3 pr-4">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          item.isActive
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
        }`}>
          {item.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onEdit(item)}
            disabled={saving}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
          >
            Edit
          </button>
          <button
            onClick={() => onToggle(item)}
            disabled={saving}
            className="text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
          >
            {item.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={() => onDelete(item)}
            disabled={saving}
            className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Edit / create form modal ──────────────────────────────────────────────────

interface ItemFormProps {
  initialName?: string;
  initialDescription?: string;
  initialSortOrder?: number;
  onSubmit: (values: { name: string; description: string; sortOrder?: number }) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  title: string;
}

function ItemForm({ initialName = '', initialDescription = '', initialSortOrder, onSubmit, onCancel, saving, error, title }: ItemFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [sortOrder, setSortOrder] = useState<string>(initialSortOrder !== undefined ? String(initialSortOrder) : '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      sortOrder: sortOrder !== '' ? Number(sortOrder) : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={255}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sort order</label>
            <input
              type="number"
              min={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="Auto"
              className="w-32 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
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

export default function LookupListPage() {
  const { type } = useParams<{ type?: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [editItem, setEditItem] = useState<LookupItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<LookupItem | null>(null);

  const activeType = (type ?? LOOKUP_TYPES[0].key) as LookupTypeKey;
  const activeLabel = LOOKUP_TYPES.find((t) => t.key === activeType)?.label ?? activeType;

  // Redirect to first type if none selected
  if (!type) {
    navigate(`/admin/settings/lookup/${LOOKUP_TYPES[0].key}`, { replace: true });
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'lookup', activeType],
    queryFn: () => listAdminLookupItems(activeType, accessToken!),
    enabled: !!accessToken,
  });

  function withStepUp(action: () => void) {
    setPendingAction(() => action);
    setStepUpOpen(true);
  }

  function onStepUpSuccess() {
    setStepUpOpen(false);
    pendingAction?.();
    setPendingAction(null);
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string; sortOrder?: number }) =>
      createLookupItem(activeType, payload, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'lookup', activeType] });
      setShowCreate(false);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof ApiResponseError ? err.message : 'Failed to create item');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateLookupItem>[1] }) =>
      updateLookupItem(id, payload, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'lookup', activeType] });
      setEditItem(null);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof ApiResponseError ? err.message : 'Failed to update item');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLookupItem(id, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'lookup', activeType] });
      setDeleteConfirm(null);
      setMutationError(null);
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof ApiResponseError ? err.message : 'Failed to delete item');
      setDeleteConfirm(null);
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="flex gap-6 h-full">
      {/* Step-up auth */}
      {stepUpOpen && <StepUpModal onSuccess={onStepUpSuccess} onCancel={() => setStepUpOpen(false)} />}

      {/* Sidebar: lookup type list */}
      <aside className="w-52 shrink-0">
        <nav className="space-y-0.5">
          {LOOKUP_TYPES.map((t) => (
            <NavLink
              key={t.key}
              to={`/admin/settings/lookup/${t.key}`}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{activeLabel}</h2>
          <button
            onClick={() => withStepUp(() => { setMutationError(null); setShowCreate(true); })}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
          >
            + Add item
          </button>
        </div>

        {mutationError && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {mutationError}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="px-0 py-3 pr-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-8">#</th>
                  <th className="py-3 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                  <th className="py-3 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Description</th>
                  <th className="py-3 pr-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    saving={saving}
                    onEdit={(i) => withStepUp(() => { setMutationError(null); setEditItem(i); })}
                    onToggle={(i) => withStepUp(() => updateMutation.mutate({ id: i.id, payload: { isActive: !i.isActive } }))}
                    onDelete={(i) => withStepUp(() => setDeleteConfirm(i))}
                  />
                ))}
                {(data?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-gray-400">No items yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <ItemForm
          title={`New ${activeLabel.replace(/s$/, '')} item`}
          onSubmit={(v) => createMutation.mutate({ name: v.name, description: v.description || undefined, sortOrder: v.sortOrder })}
          onCancel={() => setShowCreate(false)}
          saving={createMutation.isPending}
          error={mutationError}
        />
      )}

      {/* Edit modal */}
      {editItem && (
        <ItemForm
          title="Edit item"
          initialName={editItem.name}
          initialDescription={editItem.description ?? ''}
          initialSortOrder={editItem.sortOrder}
          onSubmit={(v) => updateMutation.mutate({ id: editItem.id, payload: { name: v.name, description: v.description || null, sortOrder: v.sortOrder } })}
          onCancel={() => setEditItem(null)}
          saving={updateMutation.isPending}
          error={mutationError}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delete item?</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Delete <span className="font-medium">{deleteConfirm.name}</span>? This cannot be undone. Items referenced by existing records cannot be deleted — deactivate them instead.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
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
