import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@asset-manager/types';
import type { LoginInput } from '@asset-manager/types';
import { login as loginApi, ApiResponseError } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { getDefaultRedirect } from '../lib/roleRedirect';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const currentUser = useAuthStore((s) => s.user);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  // Redirect already-authenticated users to their default page
  useEffect(() => {
    if (currentUser) {
      navigate(getDefaultRedirect(currentUser.role), { replace: true });
    }
  }, [currentUser, navigate]);

  // If ProtectedRoute sent us here with a `from` location, go back there after login.
  const from = (location.state as { from?: { pathname: string } } | null)?.from;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    setIsLocked(false);
    setRetryAfter(null);

    try {
      const result = await loginApi(data);

      if ('mfaRequired' in result && result.mfaRequired) {
        // MFA flow — ITER-1-012 will implement the challenge page
        navigate('/mfa-challenge', { state: { sessionChallenge: result.sessionChallenge } });
        return;
      }

      const loginResult = result as Exclude<typeof result, { mfaRequired: true }>;
      setAuth(loginResult.user, loginResult.accessToken);
      const destination = from?.pathname ?? getDefaultRedirect(loginResult.user.role);
      navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 403 && (err as ApiResponseError & { code?: string }).code === 'EMAIL_NOT_VERIFIED') {
          setServerError('Please verify your email address before logging in.');
        } else if (err.status === 423) {
          setIsLocked(true);
          // Parse retryAfter from the error body if available
          const body = err as ApiResponseError & { retryAfter?: number };
          setRetryAfter(body.retryAfter ?? null);
        } else {
          setServerError(err.message || 'Invalid email or password.');
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-sky-600 hover:underline font-medium">
            Register
          </Link>
        </p>

        {isLocked && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            Your account has been temporarily locked due to too many failed login attempts.
            {retryAfter && (
              <span> Please try again in {Math.ceil(retryAfter / 60)} minute(s).</span>
            )}
          </div>
        )}

        {serverError && !isLocked && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {serverError}{' '}
            {serverError.includes('verify your email') && (
              <Link to="/resend-verification" className="underline font-medium">
                Resend verification email
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className={`w-full rounded border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                errors.email ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs text-sky-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className={`w-full rounded border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                errors.password ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
