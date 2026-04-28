import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mfaSetup, mfaConfirm, mfaDisable, ApiResponseError } from '../api/auth';

type Phase = 'idle' | 'setup' | 'confirm' | 'enabled' | 'disable';

interface SetupData {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export default function MfaSetupPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backupCodesRevealed, setBackupCodesRevealed] = useState(false);

  const handleStartSetup = async () => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const data = await mfaSetup();
      setSetupData(data);
      setPhase('setup');
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 409) {
          setServerError('MFA is already enabled on your account.');
        } else {
          setServerError(err.message || 'Failed to start MFA setup.');
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);
    try {
      await mfaConfirm(confirmCode.trim());
      setPhase('enabled');
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setServerError(err.message || 'Confirmation failed. Please try again.');
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);
    try {
      await mfaDisable(disableCode.trim());
      setPhase('idle');
      setSetupData(null);
      setDisableCode('');
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setServerError(err.message || 'Failed to disable MFA. Please try again.');
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-lg w-full">

        {/* ── idle: start setup ─── */}
        {phase === 'idle' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Two-factor authentication</h1>
            <p className="text-sm text-gray-500 mb-6">
              Add an extra layer of security to your account by requiring a code from an
              authenticator app when you sign in.
            </p>

            {serverError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {serverError}
              </div>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleStartSetup}
              className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
            >
              {isSubmitting ? 'Starting…' : 'Set up authenticator app'}
            </button>

            <p className="mt-4 text-center text-sm text-gray-500">
              Already have 2FA enabled?{' '}
              <button
                type="button"
                onClick={() => { setPhase('disable'); setServerError(null); }}
                className="text-sky-600 hover:underline font-medium"
              >
                Disable it
              </button>
            </p>
          </>
        )}

        {/* ── setup: scan QR + save backup codes ─── */}
        {phase === 'setup' && setupData && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Scan QR code</h1>
            <p className="text-sm text-gray-500 mb-4">
              Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.).
            </p>

            <div className="flex justify-center mb-4">
              <img
                src={setupData.qrCodeDataUrl}
                alt="TOTP QR code"
                className="border rounded p-2 w-48 h-48"
              />
            </div>

            <p className="text-xs text-gray-500 text-center mb-1">
              Can&apos;t scan? Enter this code manually:
            </p>
            <p className="text-center font-mono text-sm bg-gray-100 rounded px-3 py-2 mb-4 tracking-widest select-all">
              {setupData.secret}
            </p>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Backup codes</span>
                <button
                  type="button"
                  onClick={() => setBackupCodesRevealed((v) => !v)}
                  className="text-xs text-sky-600 hover:underline"
                >
                  {backupCodesRevealed ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Save these codes in a safe place. Each can be used once if you lose access to your
                authenticator.
              </p>
              {backupCodesRevealed ? (
                <div className="grid grid-cols-2 gap-1 bg-gray-50 rounded border p-3">
                  {setupData.backupCodes.map((code) => (
                    <span key={code} className="font-mono text-xs text-gray-800 tracking-widest">
                      {code}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 rounded border p-3 text-center text-xs text-gray-400">
                  Click &ldquo;Reveal&rdquo; to view your backup codes
                </div>
              )}
            </div>

            {serverError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {serverError}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setPhase('confirm'); setServerError(null); }}
              className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
            >
              I&apos;ve scanned the QR code — continue
            </button>
          </>
        )}

        {/* ── confirm: enter first TOTP to activate ─── */}
        {phase === 'confirm' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Confirm setup</h1>
            <p className="text-sm text-gray-500 mb-6">
              Enter the 6-digit code from your authenticator app to complete setup.
            </p>

            {serverError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {serverError}
              </div>
            )}

            <form onSubmit={handleConfirm} noValidate className="space-y-4">
              <div>
                <label htmlFor="confirmCode" className="block text-sm font-medium text-gray-700 mb-1">
                  Authenticator code
                </label>
                <input
                  id="confirmCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  maxLength={6}
                  placeholder="000000"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || confirmCode.trim().length !== 6}
                className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
              >
                {isSubmitting ? 'Enabling…' : 'Enable two-factor authentication'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { setPhase('setup'); setServerError(null); }}
              className="mt-3 w-full text-center text-xs text-gray-400 hover:underline"
            >
              Back
            </button>
          </>
        )}

        {/* ── enabled: success state ─── */}
        {phase === 'enabled' && (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">✅</div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                Two-factor authentication enabled
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                Your account is now protected with 2FA. You&apos;ll need your authenticator app
                each time you sign in.
              </p>
              <Link
                to="/"
                className="inline-block rounded bg-sky-600 px-6 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                Go to dashboard
              </Link>
            </div>
          </>
        )}

        {/* ── disable MFA ─── */}
        {phase === 'disable' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Disable two-factor authentication</h1>
            <p className="text-sm text-gray-500 mb-6">
              Enter your current authenticator code to disable 2FA on your account.
            </p>

            {serverError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {serverError}
              </div>
            )}

            <form onSubmit={handleDisable} noValidate className="space-y-4">
              <div>
                <label htmlFor="disableCode" className="block text-sm font-medium text-gray-700 mb-1">
                  Authenticator code
                </label>
                <input
                  id="disableCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  maxLength={6}
                  placeholder="000000"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || disableCode.trim().length !== 6}
                className="w-full rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
              >
                {isSubmitting ? 'Disabling…' : 'Disable two-factor authentication'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { setPhase('idle'); setServerError(null); }}
              className="mt-3 w-full text-center text-xs text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
