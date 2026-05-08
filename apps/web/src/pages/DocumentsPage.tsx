import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listDocuments, uploadFileWithProgress, type DocumentListItem } from '../api/documents';
import { useQueryClient } from '@tanstack/react-query';
import AppShell from '../components/AppShell';
import ProtectedRoute from '../components/ProtectedRoute';

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['documents', cursor],
    queryFn: () => listDocuments({ cursor, limit: 20 }),
  });

  const docs = data?.documents ?? [];
  const [showUpload, setShowUpload] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [viewerDoc, setViewerDoc] = useState<DocumentListItem | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      setUploadPct(0);
      await uploadFileWithProgress(file, (pct) => setUploadPct(pct), null);
      queryClient.invalidateQueries(['documents']);
      setUploadPct(null);
      setShowUpload(false);
    } catch (err) {
      setUploadPct(null);
      // eslint-disable-next-line no-console
      console.error('upload failed', err);
      alert('Upload failed');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    void handleFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) void handleFile(f);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Documents</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowUpload(true)} className="px-3 py-2 rounded-lg bg-sky-600 text-white">Upload</button>
        </div>
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
                <tr key={d.id} onClick={() => setViewerDoc(d)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-sky-600">
                    <div className="flex items-center gap-2">
                      {d.mimeType.startsWith('image/') ? (
                        <img src={`/api/v1/documents/${d.id}/raw`} alt={d.filename} className="w-12 h-8 object-cover rounded" />
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">{d.mimeType.split('/')[1]}</span>
                      )}
                      <span className="truncate">{d.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{d.mimeType}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{d.size} bytes</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{d.uploadedBy ? `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{d.assetId ? 'Linked' : 'Unlinked'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{new Date(d.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Simple upload modal */}
      {showUpload && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Upload Document</h2>
            <div onDrop={handleDrop} onDragOver={handleDragOver} className="border-dashed border-2 border-gray-300 dark:border-gray-700 rounded-md p-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">Drop a file here or</p>
              <div className="mt-2">
                <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" onChange={handleFileChange} />
              </div>
            </div>
            {uploadPct !== null && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div className="bg-sky-600 h-2" style={{ width: `${uploadPct}%` }} />
                </div>
                <p className="text-sm text-gray-600 mt-2">Uploading… {uploadPct}%</p>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowUpload(false)} className="px-3 py-2 mr-2">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {(cursor || data?.nextCursor) && (
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => setCursor(undefined)} disabled={!cursor} className="text-sm text-sky-600 disabled:opacity-40">← First page</button>
          <button onClick={() => setCursor(data?.nextCursor ?? undefined)} disabled={!data?.nextCursor} className="text-sm text-sky-600 disabled:opacity-40">Load more →</button>
        </div>
      )}

      {viewerDoc && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 w-full max-w-4xl h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{viewerDoc.filename}</h3>
              <button onClick={() => setViewerDoc(null)} className="px-2 py-1">Close</button>
            </div>
            <div className="h-full">
              {viewerDoc.mimeType.startsWith('image/') ? (
                <img src={`/api/v1/documents/${viewerDoc.id}/raw`} alt={viewerDoc.filename} className="max-h-[70vh] mx-auto" />
              ) : (
                <iframe src={`/api/v1/documents/${viewerDoc.id}/raw`} title={viewerDoc.filename} className="w-full h-full" />
              )}
            </div>
          </div>
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
