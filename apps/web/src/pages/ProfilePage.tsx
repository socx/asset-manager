import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../store/authStore';
import { changePassword, ApiResponseError } from '../api/auth';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(12, 'At least 12 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must differ from current password',
    path: ['newPassword'],
  });

type FormData = z.infer<typeof changePasswordSchema>;

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(data: FormData) {
    if (!accessToken) return;
    setServerError('');
    setSuccess(false);
    try {
      await changePassword(
        { currentPassword: data.currentPassword, newPassword: data.newPassword },
        accessToken,
      );
      setSuccess(true);
      reset();
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setServerError(err.message);
      } else {
        setServerError('An unexpected error occurred.');
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 lg:px-0">
      {/* Account info */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          Account Information
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">First name</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{user?.firstName}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Last name</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{user?.lastName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-gray-500 dark:text-gray-400">Email</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Role</dt>
            <dd className="mt-0.5">
              <span className="inline-block rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 text-xs font-medium px-2.5 py-0.5">
                {user?.role?.replace(/_/g, ' ')}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {/* Change password */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          Change Password
        </h2>

        {success && (
          <div className="mb-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            Password changed successfully.
          </div>
        )}
        {serverError && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.currentPassword.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              {...register('newPassword')}
            />
            {errors.newPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.newPassword.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm new password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
