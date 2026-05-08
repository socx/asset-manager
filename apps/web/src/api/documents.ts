import { apiRequest } from './auth';

export interface DocumentListItem {
  id: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
  uploadedBy?: { id: string; firstName: string; lastName: string } | null;
  assetId?: string | null;
  metadata?: Record<string, unknown> | null;
  isPublic: boolean;
  createdAt: string;
}

export interface ListDocumentsResponse {
  documents: DocumentListItem[];
  nextCursor?: string | null;
}

export function listDocuments(params?: { assetId?: string; cursor?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.assetId) qs.set('assetId', params.assetId);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  return apiRequest<ListDocumentsResponse>(`/documents?${qs.toString()}`, { method: 'GET' });
}

export function createDocument(payload: {
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
  assetId?: string | null;
  metadata?: Record<string, unknown> | null;
  isPublic?: boolean;
}) {
  return apiRequest<{ document: DocumentListItem }>('/documents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadFile(file: File, assetId?: string | null) {
  const fd = new FormData();
  fd.append('file', file);
  if (assetId) fd.append('assetId', assetId);

  const res = await fetch(`/api/v1/documents/upload`, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(err.message ?? 'Upload failed');
  }

  return (await res.json()) as { document: DocumentListItem };
}
