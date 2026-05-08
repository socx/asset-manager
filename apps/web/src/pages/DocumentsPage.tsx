import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listDocuments, type DocumentListItem } from '../api/documents';
import AppShell from '../components/AppShell';
import ProtectedRoute from '../components/ProtectedRoute';

function DocumentRow({ doc, onClick }: { doc: DocumentListItem; onClick: () => void }) {
  return (
    <tr onClick={onClick} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <td className="px-4 py-3 text-sm text-sky-600">{doc.filename}</td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{doc.mimeType}</td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{doc.size} bytes</td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{doc.assetId ? 'Linked' : 'Unlinked'}</td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{new Date(doc.createdAt).toLocaleString()}</td>
    </tr>
  );
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['documents', cursor],
    queryFn: () => listDocuments({ cursor, limit: 20 }),
  });

  const docs = data?.documents ?? [];
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Documents</h1>
        <button onClick={() => navigate('/assets/new')} className="px-3 py-2 rounded-lg bg-sky-600 text-white">Upload</button>
      </div>

      {isLoading && <p className="py-8 text-center text-gray-500">Loading documents…</p>}
      {isError && <p className="py-8 text-center text-red-600">Failed to load documents.</p>}

      {!isLoading && docs.length === 0 && <p className="py-8 text-center text-gray-500">No documents found.</p>}

      {docs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['Filename', 'Type', 'Size', 'Uploaded By', 'Asset Link', 'Uploaded At'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {docs.map((d) => (
                <DocumentRow key={d.id} doc={d} onClick={() => (d.assetId ? navigate(`/assets/${d.assetId}`) : null as any)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(cursor || data?.nextCursor) && (
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => setCursor(undefined)} disabled={!cursor} className="text-sm text-sky-600 disabled:opacity-40">← First page</button>
          <button onClick={() => setCursor(data?.nextCursor ?? undefined)} disabled={!data?.nextCursor} className="text-sm text-sky-600 disabled:opacity-40">Load more →</button>
        </div>
      )}
    </div>
  );
}

export const DocumentsRoute = (
  <ProtectedRoute>
    <AppShell title="Documents">
      <DocumentsPage />
    </AppShell>
  </ProtectedRoute>
);
