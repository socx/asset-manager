import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listDocuments, uploadFileWithProgress, type DocumentListItem } from '../api/documents';
import { useQueryClient } from '@tanstack/react-query';
import AppShell from '../components/AppShell';
import ThumbnailImage from '../components/ThumbnailImage';
import ProtectedRoute from '../components/ProtectedRoute';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';

type SortField = 'filename' | 'size' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export default function DocumentsPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterType, setFilterType] = useState<string>('all');
  const queryClient = useQueryClient();
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['documents', cursor],
    queryFn: () => listDocuments({ cursor, limit: 20 }),
  });

  const docs = data?.documents ?? [];
  
  // Client-side sorting and filtering
  const filteredAndSortedDocs = docs
    .filter((doc) => {
      if (filterType === 'all') return true;
      if (filterType === 'images') return doc.mimeType.startsWith('image/');
      if (filterType === 'pdfs') return doc.mimeType === 'application/pdf';
      return true;
    })
    .sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      
      if (sortField === 'createdAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? cmp : -cmp;
    });

  const [showUpload, setShowUpload] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [viewerDoc, setViewerDoc] = useState<DocumentListItem | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      setUploadPct(0);
      await uploadFileWithProgress(file, (pct) => setUploadPct(pct), null);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
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

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' 
      ? <ArrowUpIcon className="h-4 w-4 inline ml-1" />
      : <ArrowDownIcon className="h-4 w-4 inline ml-1" />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Documents</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {filteredAndSortedDocs.length} document{filteredAndSortedDocs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button 
          onClick={() => setShowUpload(true)} 
          className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 transition-colors"
        >
          + Upload Document
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Filter:</span>
        <div className="flex gap-2">
          {(['all', 'images', 'pdfs'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                filterType === type
                  ? 'bg-sky-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {type === 'all' && 'All'}
              {type === 'images' && 'Images'}
              {type === 'pdfs' && 'PDFs'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading/Error states */}
      {isLoading && <p className="py-8 text-center text-gray-500">Loading documents…</p>}
      {isError && <p className="py-8 text-center text-red-600">Failed to load documents.</p>}

      {!isLoading && filteredAndSortedDocs.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {filterType === 'all' 
              ? 'No documents yet. Upload one to get started.'
              : `No ${filterType} found.`}
          </p>
        </div>
      )}

      {/* Documents table */}
      {filteredAndSortedDocs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  <button 
                    onClick={() => toggleSort('filename')}
                    className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200"
                  >
                    Filename <SortIcon field="filename" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  <button 
                    onClick={() => toggleSort('size')}
                    className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200"
                  >
                    Size <SortIcon field="size" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  <button 
                    onClick={() => toggleSort('createdAt')}
                    className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200"
                  >
                    Uploaded At <SortIcon field="createdAt" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {filteredAndSortedDocs.map((d) => (
                <tr key={d.id} onClick={() => setViewerDoc(d)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-sky-600 dark:text-sky-400">
                    <div className="flex items-center gap-3">
                      {d.mimeType.startsWith('image/') ? (
                        <ThumbnailImage
                          thumbnailUrl={`/api/v1/documents/${d.id}/thumbnail`}
                          rawUrl={`/api/v1/documents/${d.id}/raw`}
                          lqip={(d.metadata && (d.metadata as any).thumbnailLqip) ?? undefined}
                          alt={d.filename}
                          className="w-10 h-8 rounded"
                        />
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs font-medium">
                          {d.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                        </span>
                      )}
                      <span className="font-medium truncate">{d.title || d.filename}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{d.mimeType}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {(d.size / 1024).toFixed(1)} KB
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {d.uploadedBy ? `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {d.isPublic && (
                      <span className="inline-block px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded">
                        Public
                      </span>
                    )}
                    {!d.isPublic && (
                      <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-xs font-medium rounded">
                        Private
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
