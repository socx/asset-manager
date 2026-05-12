import { apiRequest } from './auth';

export interface DocumentListItem {
  id: string;
  title?: string; // optional, from backend
  filename: string; // backward compat (maps to fileName)
  storageKey: string; // backward compat (maps to storagePath)
  mimeType: string;
  size: number; // backward compat (maps to fileSizeBytes)
  ownerId?: string | null;
  uploadedBy?: { id: string; firstName: string; lastName: string } | null; // maps to uploadedById
  assetId?: string | null; // backward compat (maps to relatedAssetId)
  assetLabel?: string | null;
  documentTypeId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface ListDocumentsResponse {
  documents: DocumentListItem[];
  nextCursor?: string | null;
}

export interface DocumentTypeOption {
  id: string;
  name: string;
}

interface ListDocumentTypesResponse {
  items: Array<{ id: string; name: string; isActive?: boolean }>;
}

export interface UploadDocumentPayload {
  file: File;
  assetId?: string | null;
  title?: string;
  description?: string;
  documentTypeId?: string;
}

export function listDocuments(
  params?: { assetId?: string; cursor?: string; limit?: number; search?: string; documentTypeId?: string; uploadedById?: string },
  accessToken?: string,
) {
  const qs = new URLSearchParams();
  if (params?.assetId) qs.set('assetId', params.assetId);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.documentTypeId) qs.set('documentTypeId', params.documentTypeId);
  if (params?.uploadedById) qs.set('uploadedById', params.uploadedById);
  return apiRequest<ListDocumentsResponse>(`/documents?${qs.toString()}`, {
    method: 'GET',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
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

export function updateDocument(documentId: string, payload: { assetId?: string | null }) {
  return apiRequest<{ document: DocumentListItem }>(`/documents/${documentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteDocument(documentId: string) {
  return apiRequest<{ document: DocumentListItem }>(`/documents/${documentId}`, {
    method: 'DELETE',
  });
}

export async function listDocumentTypes(accessToken: string): Promise<DocumentTypeOption[]> {
  const data = await apiRequest<ListDocumentTypesResponse>('/lookup/document_type', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return (data.items ?? [])
    .filter((item) => item.isActive !== false)
    .map((item) => ({ id: item.id, name: item.name }));
}

export async function uploadFile(file: File, assetId?: string | null, accessToken?: string) {
  const fd = new FormData();
  fd.append('file', file);
  if (assetId) fd.append('assetId', assetId);

  const res = await fetch(`/api/v1/documents/upload`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(err.message ?? 'Upload failed');
  }

  return (await res.json()) as { document: DocumentListItem };
}

export function uploadFileWithProgress(
  file: File,
  onProgress: (pct: number) => void,
  assetId?: string | null,
  accessToken?: string,
) {
  return new Promise<{ document: DocumentListItem }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file);
    if (assetId) fd.append('assetId', assetId);

    xhr.open('POST', '/api/v1/documents/upload');
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}

export function uploadDocumentWithProgress(
  payload: UploadDocumentPayload,
  onProgress: (pct: number) => void,
  accessToken?: string,
) {
  return new Promise<{ document: DocumentListItem }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();

    fd.append('file', payload.file);
    if (payload.assetId) fd.append('assetId', payload.assetId);
    if (payload.title?.trim()) fd.append('title', payload.title.trim());
    if (payload.description?.trim()) fd.append('description', payload.description.trim());
    if (payload.documentTypeId) fd.append('documentTypeId', payload.documentTypeId);

    xhr.open('POST', '/api/v1/documents/upload');
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}
