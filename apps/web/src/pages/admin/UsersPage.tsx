import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ApiResponseError } from '../../api/auth';
import {
  listUsers,
  createUser,
  updateUser,
  setUserStatus,
  deleteUser,
  resetUserMfa,
  listUserSessions,
  revokeUserSession,
  type AdminUser,
} from '../../api/admin';
import StepUpModal from '../../components/StepUpModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLES = ['super_admin', 'system_admin', 'asset_manager', 'asset_owner'] as const;
const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-green-100 text-green-800' },
  disabled: { label: 'Disabled', cls: 'bg-red-100 text-red-800' },
  pending_verification: { label: 'Unverified', cls: 'bg-yellow-100 text-yellow-800' },
};

// ── Schemas ───────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z
    .string()
    .min(12, 'Minimum 12 characters')
    .regex(/[A-Z]/, 'Needs an uppercase letter')
    .regex(/[a-z]/, 'Needs a lowercase letter')
    .regex(/[0-9]/, 'Needs a number')
    .regex(/[^A-Za-z0-9]/, 'Needs a special character'),
  firstName: z.string().min(1, 'Required').max(100),
  lastName: z.string().min(1, 'Required').max(100),
  role: z.enum(ROLES),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(ROLES).optional(),
});

type CreateUserForm = z.infer<typeof createUserSchema>;
type UpdateUserForm = z.infer<typeof updateUserSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Step-up wrapper hook ──────────────────────────────────────────────────────

function useWithStepUp() {
  const [stepUpVisible, setStepUpVisible] = useState(false);
  const [pendingFn, setPendingFn] = useState<(() => void) | null>(null);

  function withStepUp(fn: () => void) {
    return (err: unknown) => {
      if (err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED') {
        setPendingFn(() => fn);
        setStepUpVisible(true);
      }
    };
  }

  function onStepUpSuccess() {
    setStepUpVisible(false);
    pendingFn?.();
    setPendingFn(null);
  }

  function onStepUpCancel() {
    setStepUpVisible(false);
    setPendingFn(null);
  }

  return { stepUpVisible, withStepUp, onStepUpSuccess, onStepUpCancel };
}

// ── Sessions Modal ────────────────────────────────────────────────────────────

function SessionsModal({
  user,
  accessToken,
  onClose,
  onStepUpNeeded,
}: {
  user: AdminUser;
  accessToken: string;
  onClose: () => void;
  onStepUpNeeded: (retry: () => void) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sessions', user.id],
    queryFn: () => listUserSessions(user.id, accessToken),
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => revokeUserSession(user.id, sessionId, accessToken),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'sessions', user.id] }),
    onError: (err) => {
      if (err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED') {
        onStepUpNeeded(() => {});
      }
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Sessions — {user.firstName} {user.lastName}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : !data?.sessions?.length ? (
          <p className="text-sm text-gray-500 py-4 text-center">No active sessions.</p>
        ) : (
          <ul className="space-y-2">
            {data.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 text-sm">
                <div>
                  <span className="text-gray-700 font-medium">{s.userAgent ?? 'Unknown device'}</span>
                  <span className="ml-2 text-gray-400">{s.ipAddress ?? ''}</span>
                  <div className="text-xs text-gray-400 mt-0.5">Since {formatDate(s.createdAt)}</div>
                </div>
                <button
                  onClick={() => revokeMutation.mutate(s.id)}
                  disabled={revokeMutation.isPending}
                  className="ml-4 text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({
  user,
  onConfirm,
  onCancel,
  isPending,
}: {
  user: AdminUser;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete user?</h2>
        <p className="text-sm text-gray-500 mb-6">
          <strong>{user.firstName} {user.lastName}</strong> ({user.email}) will be soft-deleted
          and all sessions immediately revoked. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create / Edit User Modal ──────────────────────────────────────────────────

function UserFormModal({
  editing,
  onClose,
  onSave,
  isPending,
  serverError,
}: {
  editing: AdminUser | null;
  onClose: () => void;
  onSave: (data: CreateUserForm | UpdateUserForm) => void;
  isPending: boolean;
  serverError: string;
}) {
  const isEdit = editing !== null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema),
    defaultValues: editing
      ? { firstName: editing.firstName, lastName: editing.lastName, email: editing.email, role: editing.role as (typeof ROLES)[number] }
      : undefined,
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit user' : 'Create user'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
              <input {...register('firstName')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
              <input {...register('lastName')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input {...register('email')} type="email" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input {...register('password')} type="password" autoComplete="new-password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select {...register('role')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
              {ROLES.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </div>

          {serverError && <p className="text-sm text-red-600">{serverError}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const accessToken = useAuthStore((s) => s.accessToken) ?? '';
  const currentUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [sessionsUser, setSessionsUser] = useState<AdminUser | null>(null);
  const [formServerError, setFormServerError] = useState('');

  const { stepUpVisible, withStepUp, onStepUpSuccess, onStepUpCancel } = useWithStepUp();

  // Users query
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'users', { search, role: roleFilter, status: statusFilter }],
    queryFn: () => listUsers({ search: search || undefined, role: roleFilter || undefined, status: statusFilter || undefined, limit: 50 }, accessToken),
    retry: (_, err) => !(err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED'),
  });

  // Trigger step-up modal when the initial load is blocked by missing step-up
  useEffect(() => {
    if (error instanceof ApiResponseError && error.code === 'STEP_UP_REQUIRED') {
      withStepUp(() => void refetch())(error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const invalidateUsers = useCallback(
    () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    [qc],
  );

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateUserForm) => createUser(payload, accessToken),
    onSuccess: () => { setShowCreate(false); void invalidateUsers(); },
    onError: (err) => {
      if (err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED') {
        withStepUp(() => setShowCreate(true))(err);
      } else if (err instanceof ApiResponseError) {
        setFormServerError(err.message);
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserForm }) =>
      updateUser(id, payload, accessToken),
    onSuccess: () => { setEditingUser(null); void invalidateUsers(); },
    onError: (err) => {
      if (err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED') {
        withStepUp(() => editingUser && updateMutation.mutate({ id: editingUser.id, payload: {} }))(err);
      } else if (err instanceof ApiResponseError) {
        setFormServerError(err.message);
      }
    },
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      setUserStatus(id, status, accessToken),
    onSuccess: () => void invalidateUsers(),
    onError: (err) => {
      if (err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED') {
        setDeletingUser(null);
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id, accessToken),
    onSuccess: () => { setDeletingUser(null); void invalidateUsers(); },
    onError: (err) => {
      if (err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED') {
        withStepUp(() => deletingUser && deleteMutation.mutate(deletingUser.id))(err);
      }
    },
  });

  // MFA reset mutation
  const mfaResetMutation = useMutation({
    mutationFn: (id: string) => resetUserMfa(id, accessToken),
    onSuccess: () => void invalidateUsers(),
    onError: (err) => {
      if (err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED') {
        withStepUp(() => {})(err);
      }
    },
  });

  const isSuperAdmin = currentUser?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <Link to="/admin" className="text-gray-400 hover:text-gray-600">Admin</Link>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-900">User Management</span>
        </div>
        <div className="text-sm text-gray-500">
          {currentUser?.firstName} {currentUser?.lastName}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <button
            onClick={() => { setFormServerError(''); setShowCreate(true); }}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            + Create user
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <input
            type="search"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="pending_verification">Unverified</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading users…</div>
          ) : isError ? (
            <div className="py-16 text-center text-sm text-red-500">Failed to load users.</div>
          ) : !data?.users?.length ? (
            <div className="py-16 text-center text-sm text-gray-400">No users found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3">Last Login</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.users.map((user) => {
                  const statusInfo = STATUS_LABELS[user.status] ?? { label: user.status, cls: 'bg-gray-100 text-gray-700' };
                  const isCurrentUser = user.id === currentUser?.id;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {user.firstName} {user.lastName}
                        {isCurrentUser && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(user.lastLoginAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {/* Sessions */}
                          <button
                            onClick={() => setSessionsUser(user)}
                            className="text-xs text-gray-500 hover:text-gray-800 font-medium"
                            title="View sessions"
                          >
                            Sessions
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => { setFormServerError(''); setEditingUser(user); }}
                            className="text-xs text-sky-600 hover:text-sky-800 font-medium"
                          >
                            Edit
                          </button>

                          {/* Enable / Disable */}
                          {!isCurrentUser && user.status !== 'pending_verification' && (
                            <button
                              onClick={() =>
                                statusMutation.mutate({
                                  id: user.id,
                                  status: user.status === 'active' ? 'disabled' : 'active',
                                })
                              }
                              disabled={statusMutation.isPending}
                              className={`text-xs font-medium ${user.status === 'active' ? 'text-orange-600 hover:text-orange-800' : 'text-green-600 hover:text-green-800'}`}
                            >
                              {user.status === 'active' ? 'Disable' : 'Enable'}
                            </button>
                          )}

                          {/* Reset MFA — super_admin only */}
                          {isSuperAdmin && (
                            <button
                              onClick={() => mfaResetMutation.mutate(user.id)}
                              disabled={mfaResetMutation.isPending}
                              className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                              title="Reset MFA"
                            >
                              MFA↺
                            </button>
                          )}

                          {/* Delete */}
                          {!isCurrentUser && (
                            <button
                              onClick={() => setDeletingUser(user)}
                              className="text-xs text-red-600 hover:text-red-800 font-medium"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {data?.nextCursor && (
          <p className="mt-3 text-xs text-gray-400 text-center">Showing first 50 results. Use filters to narrow down.</p>
        )}
      </main>

      {/* Modals */}
      {(showCreate || editingUser) && (
        <UserFormModal
          editing={editingUser}
          onClose={() => { setShowCreate(false); setEditingUser(null); }}
          onSave={(data) => {
            if (editingUser) {
              updateMutation.mutate({ id: editingUser.id, payload: data as UpdateUserForm });
            } else {
              createMutation.mutate(data as CreateUserForm);
            }
          }}
          isPending={createMutation.isPending || updateMutation.isPending}
          serverError={formServerError}
        />
      )}

      {deletingUser && (
        <DeleteModal
          user={deletingUser}
          onConfirm={() => deleteMutation.mutate(deletingUser.id)}
          onCancel={() => setDeletingUser(null)}
          isPending={deleteMutation.isPending}
        />
      )}

      {sessionsUser && (
        <SessionsModal
          user={sessionsUser}
          accessToken={accessToken}
          onClose={() => setSessionsUser(null)}
          onStepUpNeeded={(retry) => {
            setSessionsUser(null);
            withStepUp(retry)(new ApiResponseError('', 403, 'STEP_UP_REQUIRED'));
          }}
        />
      )}

      {stepUpVisible && (
        <StepUpModal onSuccess={onStepUpSuccess} onCancel={onStepUpCancel} />
      )}
    </div>
  );
}
