import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resendVerificationSchema } from '@asset-manager/types';
import type { ResendVerificationInput } from '@asset-manager/types';
import { ApiResponseError } from '../api/auth';

async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await fetch('/api/v1/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = (await res.json()) as { message: string };
  if (!res.ok) throw new ApiResponseError(data.message, res.status);
  return data;
}

export default function ResendVerificationPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchema),
  });

  const onSubmit = async (data: ResendVerificationInput) => {
    setServerError(null);
    try {
      await resendVerification(data.email);
      setSubmitted(true);
    } catch {
      setServerError('An unexpected error occurred. Please try again.');
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">✉️</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Check your inbox</h1>
          <p className="text-gray-500 text-sm">
            If that email address is registered and unverified, we've sent a new verification link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Resend verification email</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter the email address you registered with and we'll send you a new link.
        </p>

        {serverError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {serverError}
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold py-2 px-4 rounded-md text-sm transition-colors"
          >
            {isSubmitting ? 'Sending…' : 'Send verification email'}
          </button>
        </form>

        <p className="mt-4 text-sm text-center text-gray-500">
          <Link to="/login" className="text-sky-600 hover:underline font-medium">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
