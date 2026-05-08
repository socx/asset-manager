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

      {/* Filter & Sort toolbar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sort by:</span>
          <div className="flex gap-2">
            {(['filename', 'size', 'createdAt'] as const).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                  sortField === field
                    ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {field === 'filename' && 'Name'}
                {field === 'size' && 'Size'}
                {field === 'createdAt' && 'Date'}
                {sortField === field && (sortOrder === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />)}
              </button>
            ))}
          </div>
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

      {/* Documents grid */}
      {filteredAndSortedDocs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAndSortedDocs.map((d) => (
            <div
              key={d.id}
              onClick={() => setViewerDoc(d)}
              className="relative group bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 hover:border-sky-500 dark:hover:border-sky-400 cursor-pointer"
            >
              {/* Thumbnail */}
              <div className="relative aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                {d.mimeType.startsWith('image/') ? (
                  <ThumbnailImage
                    thumbnailUrl={`/api/v1/documents/${d.id}/thumbnail`}
                    rawUrl={`/api/v1/documents/${d.id}/raw`}
                    lqip={(d.metadata && (d.metadata as any).thumbnailLqip) ?? undefined}
                    alt={d.filename}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : d.mimeType === 'application/pdf' ? (
                  <div className="flex items-center justify-center h-full bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/20 dark:to-red-800/20">
                    <svg className="w-12 h-12 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8.707 7.707a1 1 0 0 0-1.414-1.414L5.636 7.879a2 2 0 1 0 2.828 2.828l1.243-1.243a1 1 0 0 0-1.414-1.414l-.586.586zM12.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
                      <path fillRule="evenodd" d="M4 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/20 dark:to-blue-800/20">
                    <svg className="w-12 h-12 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                
                {/* Badge overlay */}
                <div className="absolute top-2 right-2">
                  {d.isPublic ? (
                    <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded">
                      Public
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded">
                      Private
                    </span>
                  )}
                </div>
              </div>

              {/* Card content */}
              <div className="p-3">
                {/* Filename */}
                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate mb-1">
                  {d.title || d.filename}
                </p>

                {/* File type and size */}
                <div className="flex items-center justify-between mb-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="uppercase">{d.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                  <span>{(d.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>

                {/* Upload date and uploader */}
                <div className="space-y-1 pb-3 border-t border-gray-200 dark:border-gray-700 pt-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                  {d.uploadedBy && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      by <span className="font-medium">{d.uploadedBy.firstName} {d.uploadedBy.lastName}</span>
                    </p>
                  )}
                </div>

                {/* Action button */}
                <button
                  className="w-full px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded transition-colors"
                >
                  View
                </button>
              </div>
            </div>
          ))}
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
