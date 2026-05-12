import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteDocument,
  listDocumentTypes,
  listDocuments,
  uploadDocumentWithProgress,
  type DocumentListItem,
  type ListDocumentsResponse,
} from '../api/documents';
import { listPropertyAssets } from '../api/assets';
import AppShell from '../components/AppShell';
import ThumbnailImage from '../components/ThumbnailImage';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuthStore } from '../store/authStore';
import { ArrowDownIcon, ArrowUpIcon, Bars3Icon, TableCellsIcon } from '@heroicons/react/24/outline';

type SortField = 'filename' | 'size' | 'createdAt';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'table';

export default function DocumentsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('docs-view-mode');
      return (saved as ViewMode) || 'grid';
    } catch {
      return 'grid';
    }
  });

  const [showUpload, setShowUpload] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [viewerDoc, setViewerDoc] = useState<DocumentListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentListItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadDocumentTypeId, setUploadDocumentTypeId] = useState('');
  const [uploadAssetId, setUploadAssetId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);

  useEffect(() => {
    try {
      localStorage.setItem('docs-view-mode', viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['documents', cursor, accessToken, searchQuery],
    queryFn: () => listDocuments({ cursor, limit: 20, search: searchQuery.trim() || undefined }, accessToken ?? undefined),
    enabled: !!accessToken,
  });

  const documentTypesQuery = useQuery({
    queryKey: ['lookup', 'document_type', accessToken],
    queryFn: () => listDocumentTypes(accessToken ?? ''),
    enabled: showUpload && !!accessToken,
  });

  const accessibleAssetsQuery = useQuery({
    queryKey: ['assets-upload-accessible', accessToken],
    queryFn: () => listPropertyAssets({ limit: 100 }, accessToken ?? ''),
    enabled: showUpload && !!accessToken,
  });

  const docs = data?.documents ?? [];

  const filteredAndSortedDocs = docs
    .filter((doc) => {
      if (filterType === 'images' && !doc.mimeType.startsWith('image/')) return false;
      if (filterType === 'pdfs' && doc.mimeType !== 'application/pdf') return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;

      if (sortField === 'size') {
        cmp = a.size < b.size ? -1 : a.size > b.size ? 1 : 0;
      } else if (sortField === 'createdAt') {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        cmp = aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
      } else {
        const aName = (a.title || a.filename || '').toLowerCase();
        const bName = (b.title || b.filename || '').toLowerCase();
        cmp = aName < bName ? -1 : aName > bName ? 1 : 0;
      }

      return sortOrder === 'asc' ? cmp : -cmp;
    });

  const assetOptions = accessibleAssetsQuery.data?.assets ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: (_result, id) => {
      queryClient.setQueriesData({ queryKey: ['documents'] }, (old: unknown) => {
        const parsed = old as ListDocumentsResponse | undefined;
        if (!parsed?.documents) return old;
        return {
          ...parsed,
          documents: parsed.documents.filter((doc) => doc.id !== id),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      if (viewerDoc?.id === id) setViewerDoc(null);
      setDeleteTarget(null);
      setShowDeleteConfirm(false);
    },
  });

  function resetUploadForm() {
    setUploadTitle('');
    setUploadDescription('');
    setUploadDocumentTypeId('');
    setUploadAssetId(null);
    setSelectedFile(null);
    setUploadError(null);
    setUploadPct(null);
  }

  function openUploadModal() {
    resetUploadForm();
    setShowUpload(true);
  }

  function closeUploadModal() {
    setShowUpload(false);
    resetUploadForm();
  }

  function formatFileSize(size: number): string {
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  function typeLabel(mimeType: string): string {
    return mimeType.split('/')[1]?.toUpperCase() || 'FILE';
  }

  function getThumbnailLqip(doc: DocumentListItem): string | undefined {
    const meta = doc.metadata as Record<string, unknown> | null;
    const value = meta?.thumbnailLqip;
    return typeof value === 'string' ? value : undefined;
  }

  function validateUpload(file: File | null): string | null {
    if (!file) return 'Please choose a file.';
    if (!uploadAssetId) return 'Please select a related asset.';
    if (!uploadTitle.trim()) return 'Please provide a title.';
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg']);
    if (!allowed.has(file.type)) return 'Only PDF, PNG, and JPEG files are allowed.';
    if (file.size > 20 * 1024 * 1024) return 'File too large. Maximum allowed size is 20 MB.';
    return null;
  }

  async function handleUploadSubmit() {
    const validationError = validateUpload(selectedFile);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    try {
      setUploadError(null);
      setUploadPct(0);
      const result = await uploadDocumentWithProgress({
        file: selectedFile as File,
        assetId: uploadAssetId,
        title: uploadTitle,
        description: uploadDescription,
        documentTypeId: uploadDocumentTypeId || undefined,
      }, (pct) => setUploadPct(pct), accessToken ?? undefined);

      queryClient.setQueryData<ListDocumentsResponse | undefined>(['documents', cursor], (old) => {
        if (!old) return { documents: [result.document], nextCursor: null };
        return {
          ...old,
          documents: [result.document, ...old.documents.filter((d) => d.id !== result.document.id)],
        };
      });

      queryClient.invalidateQueries({ queryKey: ['documents'] });
      closeUploadModal();
    } catch {
      setUploadPct(null);
      setUploadError('Upload failed. Please try again.');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSelectedFile(f);
    setUploadError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      setSelectedFile(f);
      setUploadError(null);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDeleteClick(doc: DocumentListItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    setDeleteTarget(doc);
    setShowDeleteConfirm(true);
  }

  function clampZoom(next: number): number {
    if (next < 0.5) return 0.5;
    if (next > 3) return 3;
    return Number(next.toFixed(2));
  }

  useEffect(() => {
    if (!viewerDoc) setImageZoom(1);
  }, [viewerDoc]);

  function assetOptionLabel(asset: { code: string; customAlias: string | null }): string {
    return asset.customAlias || asset.code;
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {filteredAndSortedDocs.length} document{filteredAndSortedDocs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
            title={`Switch to ${viewMode === 'grid' ? 'table' : 'grid'} view`}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {viewMode === 'grid' ? <TableCellsIcon className="w-5 h-5" /> : <Bars3Icon className="w-5 h-5" />}
          </button>
          <button onClick={openUploadModal} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 transition-colors">
            + Upload Document
          </button>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search documents by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Filter:</span>
          <div className="flex gap-2">
            {(['all', 'images', 'pdfs'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${filterType === type
                  ? 'bg-sky-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
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
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${sortField === field
                  ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
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

      {isLoading && <p className="py-8 text-center text-gray-500">Loading documents...</p>}
      {isError && <p className="py-8 text-center text-red-600">Failed to load documents.</p>}

      {!isLoading && filteredAndSortedDocs.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {filterType === 'all' ? 'No documents yet. Upload one to get started.' : `No ${filterType} found.`}
          </p>
        </div>
      )}

      {filteredAndSortedDocs.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAndSortedDocs.map((d) => (
            <div
              key={d.id}
              onClick={() => setViewerDoc(d)}
              className="relative group bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 hover:border-sky-500 dark:hover:border-sky-400 cursor-pointer"
            >
              <div className="relative aspect-square bg-gray-100 dark:bg-gray-700 overflow-hidden">
                {d.mimeType.startsWith('image/') ? (
                  <ThumbnailImage
                    thumbnailUrl={`/api/v1/documents/${d.id}/thumbnail`}
                    rawUrl={`/api/v1/documents/${d.id}/raw`}
                    lqip={getThumbnailLqip(d)}
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
                <div className="absolute top-2 right-2">
                  {d.isPublic ? (
                    <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded">Public</span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded">Private</span>
                  )}
                </div>
              </div>

              <div className="p-3">
                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate mb-1">{d.title || d.filename}</p>
                <div className="flex items-center justify-between mb-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="uppercase">{typeLabel(d.mimeType)}</span>
                  <span>{formatFileSize(d.size)}</span>
                </div>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-500">Asset: {d.assetLabel ?? d.assetId ?? 'Unlinked'}</p>
                <div className="space-y-1 pb-3 border-t border-gray-200 dark:border-gray-700 pt-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400">{new Date(d.createdAt).toLocaleDateString()}</p>
                  {d.uploadedBy && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      by <span className="font-medium">{d.uploadedBy.firstName} {d.uploadedBy.lastName}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerDoc(d);
                    }}
                    className="flex-1 px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(d, e)}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredAndSortedDocs.length > 0 && viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  <button onClick={() => toggleSort('filename')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200">
                    Title {sortField === 'filename' && (sortOrder === 'asc' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Related Asset</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Uploaded By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  <button onClick={() => toggleSort('createdAt')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-200">
                    Uploaded {sortField === 'createdAt' && (sortOrder === 'asc' ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />)}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Size</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {filteredAndSortedDocs.map((d) => (
                <tr key={d.id} onClick={() => setViewerDoc(d)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-sky-600 dark:text-sky-400">{d.title || d.filename}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{typeLabel(d.mimeType)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{d.assetLabel ?? d.assetId ?? 'Unlinked'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{d.uploadedBy ? `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatFileSize(d.size)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewerDoc(d);
                        }}
                        className="rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                      >
                        View
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(d, e)}
                        className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
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

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-xl max-h-[90vh] overflow-auto">
            <h2 className="text-lg font-semibold mb-4">Upload Document</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="upload-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                <input id="upload-title" type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" placeholder="Lease agreement" />
              </div>
              <div>
                <label htmlFor="upload-description" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea id="upload-description" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} rows={3} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" placeholder="Optional notes" />
              </div>
              <div>
                <label htmlFor="upload-doc-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Document Type</label>
                <select id="upload-doc-type" value={uploadDocumentTypeId} onChange={(e) => setUploadDocumentTypeId(e.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value="">Select document type</option>
                  {(documentTypesQuery.data ?? []).map((opt) => (<option key={opt.id} value={opt.id}>{opt.name}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor="upload-asset" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Related Asset</label>
                <select
                  id="upload-asset"
                  value={uploadAssetId ?? ''}
                  onChange={(e) => setUploadAssetId(e.target.value || null)}
                  disabled={accessibleAssetsQuery.isLoading || assetOptions.length === 0}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-900"
                >
                  <option value="">
                    {accessibleAssetsQuery.isLoading ? 'Loading assets...' : assetOptions.length === 0 ? 'No accessible assets available' : 'Select related asset'}
                  </option>
                  {assetOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>{assetOptionLabel(asset)}</option>
                  ))}
                </select>
                {!accessibleAssetsQuery.isLoading && assetOptions.length === 0 && (
                  <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                    You cannot upload a document because you do not currently have access to any assets.
                  </p>
                )}
              </div>
              <div onDrop={handleDrop} onDragOver={handleDragOver} className="border-dashed border-2 border-gray-300 dark:border-gray-700 rounded-md p-6 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">Drop a file here or</p>
                <div className="mt-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">Browse Files</button>
                  <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" onChange={handleFileChange} className="hidden" />
                </div>
                {selectedFile && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Selected: <span className="font-medium">{selectedFile.name}</span> ({formatFileSize(selectedFile.size)})</p>}
              </div>
              {uploadError && <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
              {uploadPct !== null && (
                <div className="mt-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden"><div className="bg-sky-600 h-2" style={{ width: `${uploadPct}%` }} /></div>
                  <p className="text-sm text-gray-600 mt-2">Uploading... {uploadPct}%</p>
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={closeUploadModal} className="rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={() => void handleUploadSubmit()} className="rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50" disabled={uploadPct !== null || accessibleAssetsQuery.isLoading || assetOptions.length === 0}>Upload</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewerDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 w-full max-w-6xl h-[85vh] overflow-auto">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">{viewerDoc.title || viewerDoc.filename}</h3>
              <div className="flex items-center gap-2">
                <a href={`/api/v1/documents/${viewerDoc.id}/file`} download={viewerDoc.filename} className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">Download</a>
                <button onClick={() => setViewerDoc(null)} className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Close</button>
              </div>
            </div>
            <div className="grid h-[calc(100%-3rem)] grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
                {viewerDoc.mimeType.startsWith('image/') && (
                  <div className="mb-2 flex items-center gap-2">
                    <button onClick={() => setImageZoom((z) => clampZoom(z - 0.25))} className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600">-</button>
                    <button onClick={() => setImageZoom((z) => clampZoom(z + 0.25))} className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600">+</button>
                    <span className="text-xs text-gray-600 dark:text-gray-400">Zoom: {(imageZoom * 100).toFixed(0)}%</span>
                  </div>
                )}
                <div className="h-[calc(100%-2rem)] overflow-auto">
                  {viewerDoc.mimeType.startsWith('image/') ? (
                    <img src={`/api/v1/documents/${viewerDoc.id}/file`} alt={viewerDoc.filename} className="mx-auto max-h-[70vh]" style={{ transform: `scale(${imageZoom})`, transformOrigin: 'top center' }} />
                  ) : (
                    <iframe src={`/api/v1/documents/${viewerDoc.id}/file`} title={viewerDoc.filename} className="h-full w-full" />
                  )}
                </div>
              </div>
              <aside className="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
                <h4 className="mb-3 font-semibold text-gray-900 dark:text-white">Metadata</h4>
                <dl className="space-y-2 text-gray-700 dark:text-gray-300">
                  <div><dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Filename</dt><dd>{viewerDoc.filename}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Type</dt><dd>{typeLabel(viewerDoc.mimeType)}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Size</dt><dd>{formatFileSize(viewerDoc.size)}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Uploaded</dt><dd>{new Date(viewerDoc.createdAt).toLocaleString()}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Visibility</dt><dd>{viewerDoc.isPublic ? 'Public' : 'Private'}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Related Asset</dt><dd>{viewerDoc.assetLabel ?? viewerDoc.assetId ?? 'Unlinked'}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Document Type ID</dt><dd>{viewerDoc.documentTypeId ?? '—'}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500 dark:text-gray-400">Description</dt><dd>{viewerDoc.description ?? '—'}</dd></div>
                </dl>
              </aside>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Document</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Are you sure you want to delete <span className="font-semibold">{deleteTarget.title || deleteTarget.filename}</span>? This action is a soft delete.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setDeleteTarget(null); setShowDeleteConfirm(false); }} className="rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" disabled={deleteMutation.isPending}>Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50" disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</button>
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
