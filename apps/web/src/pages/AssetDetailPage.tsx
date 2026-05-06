import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../store/authStore';
import { getPropertyAssetDetail } from '../api/assets';

const ADMIN_ROLES = new Set(['super_admin', 'system_admin']);

function requireAccessToken(token: string | null): string {
  if (!token) throw new Error('Not authenticated');
  return token;
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const detailQuery = useQuery({
    queryKey: ['asset-detail', id],
    queryFn: async () => getPropertyAssetDetail(String(id), requireAccessToken(accessToken)),
    enabled: Boolean(id),
  });

  const asset = detailQuery.data?.asset;

  const canEditOrDelete = useMemo(() => {
    if (!asset || !user) return false;
    if (ADMIN_ROLES.has(user.role)) return true;
    return asset.ownerId === user.id || asset.managedByUserId === user.id;
  }, [asset, user]);

  if (detailQuery.isLoading) {
    return <p className="py-8 text-sm text-gray-500 dark:text-gray-400" role="status">Loading asset detail...</p>;
  }

  if (detailQuery.isError || !asset) {
    return <p className="py-8 text-sm text-red-600 dark:text-red-400">Failed to load asset detail.</p>;
  }

  return (
    <div className="space-y-6">
      <nav className="text-sm text-gray-500 dark:text-gray-400">
        <Link to="/assets" className="hover:underline">Assets</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700 dark:text-gray-200">{asset.customAlias ?? asset.code}</span>
      </nav>

      <button
        onClick={() => navigate('/assets')}
        className="inline-flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Assets
      </button>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{asset.customAlias ?? asset.code}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {[asset.addressLine1, asset.city, asset.postCode].filter(Boolean).join(', ')}
            </p>
          </div>

          {canEditOrDelete && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <PencilSquareIcon className="h-4 w-4" /> Edit
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <TrashIcon className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-5 text-sm text-gray-500 dark:text-gray-400">
          Detail scaffold ready. Tabs and sub-entity sections will be added in the next ITER-4-004 slices.
        </div>
      </div>
    </div>
  );
}
