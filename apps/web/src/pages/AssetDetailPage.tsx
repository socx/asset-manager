import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/assets')}
        className="inline-flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Assets
      </button>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center space-y-2">
        <p className="text-lg font-semibold text-gray-800 dark:text-white">Asset Detail</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Detail view for asset <span className="font-mono">{id}</span> coming in the next iteration.
        </p>
      </div>
    </div>
  );
}
