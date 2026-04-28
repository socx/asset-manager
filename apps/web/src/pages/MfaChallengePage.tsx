import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { mfaVerify, ApiResponseError } from '../api/auth';
import { useAuthStore } from '../store/authStore';

interface LocationState {
  sessionChallenge?: string;
}

export default function MfaChallengePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);

  const state = location.state as LocationState | null;
  const sessionChallenge = state?.sessionChallenge ?? '';

  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If somehow the page is reached without a challenge, redirect to login.
  if (!sessionChallenge) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Session expired</h1>
          <p className="text-sm text-gray-500 mb-4">
            Your MFA session has expired. Please log in again.
          </p>
          <Link to="/login" className="text-sky-600 hover:underline text-sm font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);

    try {
      const payload =
        mode === 'totp'
          ? { sessionChallenge, totpCode: code.trim() }
          : { sessionChallenge, backupCode: code.trim().toUpperCase() };

      const result = await mfaVerify(payload);
      setAuth(result.user, result.accessToken);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setServerError(err.message || 'Verification failed. Please try again.');
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Two-factor verification</h1>
        <p className="text-sm text-gray-500 mb-6">
          {mode === 'totp'
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter one of your saved backup codes.'}
        </p>

        {serverError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
              {mode === 'totp' ? 'Authenticator code' : 'Backup code'}
            </label>
            <input
              id="code"
              type="text"
              inputMode={mode === 'totp' ? 'numeric' : 'text'}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={mode === 'totp' ? 6 : 10}
              placeholder={mode === 'totp' ? '000000' : 'AABB00CCDD'}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || code.trim().length === 0}
            className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
          >
            {isSubmitting ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-sm text-gray-500">
          <button
            type="button"
            onClick={() => { setMode(mode === 'totp' ? 'backup' : 'totp'); setCode(''); setServerError(null); }}
            className="text-sky-600 hover:underline"
          >
            {mode === 'totp' ? 'Use a backup code instead' : 'Use authenticator app instead'}
          </button>
          <Link to="/login" className="text-gray-400 hover:underline text-xs">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
