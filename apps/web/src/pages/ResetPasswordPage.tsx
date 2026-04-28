import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPasswordSchema } from '@asset-manager/types';
import type { ResetPasswordInput } from '@asset-manager/types';
import { resetPassword as resetPasswordApi, ApiResponseError } from '../api/auth';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = async (data: ResetPasswordInput) => {
    setServerError(null);
    try {
      await resetPasswordApi(data);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid reset link</h1>
          <p className="text-gray-500 text-sm mb-4">
            This password reset link is missing a token. Please request a new one.
          </p>
          <Link to="/forgot-password" className="text-sky-600 hover:underline text-sm font-medium">
            Request new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Password reset</h1>
          <p className="text-gray-500 text-sm mb-4">
            Your password has been updated. You have been signed out of all devices. Please log in
            with your new password.
          </p>
          <Link
            to="/login"
            className="inline-block rounded bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Choose a new password</h1>
        <p className="text-sm text-gray-500 mb-6">
          Must be at least 12 characters with uppercase, lowercase, number and special character.
        </p>

        {serverError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {serverError}{' '}
            {serverError.toLowerCase().includes('expired') && (
              <Link to="/forgot-password" className="underline font-medium">
                Request a new link
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* Hidden token field */}
          <input type="hidden" {...register('token')} />

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
              className={`w-full rounded border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                errors.newPassword ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.newPassword && (
              <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
          >
            {isSubmitting ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
