import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { ApiResponseError } from '../../api/auth';
import { listSettings, updateSetting, type SystemSetting } from '../../api/admin';
import StepUpModal from '../../components/StepUpModal';

// ── Setting row component ─────────────────────────────────────────────────────

interface SettingRowProps {
  setting: SystemSetting;
  onSave: (key: string, value: string) => void;
  saving: boolean;
}

function SettingRow({ setting, onSave, saving }: SettingRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(setting.value);

  function handleSave() {
    onSave(setting.key, draft);
    setEditing(false);
  }

  function handleCancel() {
    setDraft(setting.value);
    setEditing(false);
  }

  // Reset draft when the setting value changes (after a successful save)
  if (!editing && draft !== setting.value) {
    setDraft(setting.value);
  }

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-4 pr-4 w-64">
        <p className="font-mono text-sm font-medium text-gray-900">{setting.key}</p>
        <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>
      </td>
      <td className="py-4 pr-4 text-sm text-gray-500 capitalize">{setting.type}</td>
      <td className="py-4 pr-4 min-w-[160px]">
        {editing ? (
          setting.type === 'boolean' ? (
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              type="number"
              min={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )
        ) : (
          <span className="font-mono text-sm">{setting.value}</span>
        )}
      </td>
      <td className="py-4 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [stepUpVisible, setStepUpVisible] = useState(false);
  const [pendingFn, setPendingFn] = useState<(() => void) | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => listSettings(accessToken ?? ''),
    enabled: !!accessToken,
    retry: (_, err) => !(err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED'),
  });

  useEffect(() => {
    if (error instanceof ApiResponseError && error.code === 'STEP_UP_REQUIRED') {
      setPendingFn(() => () => void refetch());
      setStepUpVisible(true);
    }
  }, [error]);

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateSetting(key, value, accessToken ?? ''),
    onSuccess: (_, { key }) => {
      setSuccessKey(key);
      setErrorMsg(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      setTimeout(() => setSuccessKey(null), 3000);
    },
  });

  function handleSave(key: string, value: string) {
    setErrorMsg(null);
    mutation.mutate(
      { key, value },
      {
        onError: (err) => {
          if (err instanceof ApiResponseError && err.code === 'STEP_UP_REQUIRED') {
            setPendingFn(() => () => handleSave(key, value));
            setStepUpVisible(true);
            return;
          }
          if (err instanceof ApiResponseError) {
            setErrorMsg(err.message);
          } else {
            setErrorMsg('An unexpected error occurred.');
          }
        },
      },
    );
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

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {errorMsg && (
          <div className="mb-4 rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          {isLoading && (
            <p className="text-center py-12 text-gray-500">Loading settings…</p>
          )}

          {error && (
            <p className="text-center py-12 text-red-500">Failed to load settings.</p>
          )}

          {data && (
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Key</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.settings.map((setting) => (
                  <SettingRow
                    key={setting.key}
                    setting={successKey === setting.key ? { ...setting, value: setting.value } : setting}
                    onSave={handleSave}
                    saving={mutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {successKey && (
          <p className="mt-3 text-sm text-green-600">✓ {successKey} updated successfully.</p>
        )}
      </div>

      {stepUpVisible && (
        <StepUpModal onSuccess={onStepUpSuccess} onCancel={onStepUpCancel} />
      )}
    </>
  );
}
