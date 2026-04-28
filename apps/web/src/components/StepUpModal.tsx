import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { stepUp, ApiResponseError } from '../api/auth';
import { useAuthStore } from '../store/authStore';

interface StepUpModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const schema = z.object({ password: z.string().min(1, 'Password is required') });
type FormData = z.infer<typeof schema>;

export default function StepUpModal({ onSuccess, onCancel }: StepUpModalProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError('');
    try {
      await stepUp(data.password, accessToken ?? '');
      onSuccess();
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred.');
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Re-authenticate</h2>
        <p className="text-sm text-gray-500 mb-5">
          Admin actions require password confirmation.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="step-up-password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="step-up-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              {...register('password')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-red-600">{serverError}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Verifying…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
