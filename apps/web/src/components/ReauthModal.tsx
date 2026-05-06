import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { login, ApiResponseError } from '../api/auth';
import { useAuthStore } from '../store/authStore';

export default function ReauthModal() {
  const email = useAuthStore((s) => s.user?.email);
  const visible = useAuthStore((s) => s.reauthVisible);
  const setVisible = useAuthStore((s) => s.setReauthVisible);
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await login({ email, password });
      if ('accessToken' in res) {
        setAuth(res.user, res.accessToken);
        setVisible(false);
        queryClient.invalidateQueries();
      }
    } catch (err) {
      if (err instanceof ApiResponseError) setError(err.message);
      else setError('Failed to re-authenticate');
    } finally {
      setLoading(false);
      setPassword('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <form onSubmit={submit} className="bg-white p-6 rounded shadow-md w-96">
        <h3 className="text-lg font-medium">Session expired</h3>
        <p className="text-sm text-gray-600 mt-2">Your session has expired — please re-enter your password to continue.</p>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <div className="mt-1 text-sm text-gray-700">{email}</div>
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded border px-2 py-1"
            autoFocus
          />
        </div>
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-1" onClick={() => setVisible(false)} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
