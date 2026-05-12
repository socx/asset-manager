import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DocumentsPage from '../DocumentsPage';
import * as docsApi from '../../api/documents';
import * as assetsApi from '../../api/assets';

vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string }) => unknown) => selector({ accessToken: 'test-token' }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockListDocuments = vi.spyOn(docsApi, 'listDocuments');
const mockDeleteDocument = vi.spyOn(docsApi, 'deleteDocument');
const mockListDocumentTypes = vi.spyOn(docsApi, 'listDocumentTypes');
const mockListPropertyAssets = vi.spyOn(assetsApi, 'listPropertyAssets');

beforeEach(() => {
  mockListDocuments.mockResolvedValue({ documents: [], nextCursor: null });
  mockDeleteDocument.mockResolvedValue({ document: {} as never });
  mockListDocumentTypes.mockResolvedValue([]);
  mockListPropertyAssets.mockResolvedValue({
    assets: [{
      id: 'asset-1',
      code: 'AST-001',
      customAlias: 'Riverside Flat',
      addressLine1: '1 River Road',
      addressLine2: null,
      city: 'London',
      county: null,
      postCode: 'N1 1AA',
      country: 'UK',
      propertyStatus: null,
      propertyPurpose: null,
      owner: null,
      managedByUser: null,
      managedByCompany: null,
      valuations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    nextCursor: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DocumentsPage', () => {
  it('shows loading state initially', () => {
    mockListDocuments.mockReturnValue(new Promise(() => { /* pending */ }));
    renderPage();
    expect(screen.getByText(/loading documents/i)).toBeInTheDocument();
  });

  it('renders empty state when no documents returned', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
    });
  });

  it('renders document rows when API returns items', async () => {
    const d = {
      id: 'd1',
      filename: 'file.pdf',
      storageKey: 's3://b/file.pdf',
      mimeType: 'application/pdf',
      size: 123,
      uploadedBy: { id: 'u1', firstName: 'Alice', lastName: 'A' },
      assetId: null,
      assetLabel: null,
      metadata: null,
      isPublic: false,
      createdAt: new Date().toISOString(),
    };
    mockListDocuments.mockResolvedValue({ documents: [d], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('file.pdf')).toBeInTheDocument();
    });
    expect(screen.getAllByText('PDF').length).toBeGreaterThan(0);
    expect(screen.getByText(/0\.00 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Alice A/)).toBeInTheDocument();
  });

  it('opens viewer modal with metadata panel and download action', async () => {
    const d = {
      id: 'd2',
      filename: 'viewer.pdf',
      title: 'Viewer PDF',
      storageKey: 's3://b/viewer.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      uploadedBy: { id: 'u1', firstName: 'Alice', lastName: 'A' },
      assetId: 'asset-1',
      assetLabel: 'Riverside Flat',
      documentTypeId: 'doc-type-1',
      documentTypeName: 'Lease Agreement',
      description: 'Lease copy',
      metadata: null,
      isPublic: false,
      createdAt: new Date().toISOString(),
    };
    mockListDocuments.mockResolvedValue({ documents: [d], nextCursor: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Viewer PDF')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('View')[0]);

    expect(screen.getByText(/metadata/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument();
    expect(screen.getByText(/lease copy/i)).toBeInTheDocument();
    expect(screen.getByText('Lease Agreement')).toBeInTheDocument();
  });

  it('shows delete confirmation dialog from card actions', async () => {
    const d = {
      id: 'd3',
      filename: 'delete-me.pdf',
      storageKey: 's3://b/delete-me.pdf',
      mimeType: 'application/pdf',
      size: 1234,
      uploadedBy: { id: 'u1', firstName: 'Alice', lastName: 'A' },
      assetId: null,
      assetLabel: null,
      metadata: null,
      isPublic: false,
      createdAt: new Date().toISOString(),
    };
    mockListDocuments.mockResolvedValue({ documents: [d], nextCursor: null });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('delete-me.pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Delete')[0]);

    expect(screen.getByText(/delete document/i)).toBeInTheDocument();
    expect(screen.getByText(/soft delete/i)).toBeInTheDocument();
  });

  it('renders richer upload form fields with accessible asset dropdown', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload document/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /upload document/i }));

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/document type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/related asset/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /riverside flat/i })).toBeInTheDocument();
    });
  });

  it('shows asset label instead of raw asset id', async () => {
    const d = {
      id: 'd4',
      filename: 'linked.pdf',
      storageKey: 's3://b/linked.pdf',
      mimeType: 'application/pdf',
      size: 123,
      uploadedBy: { id: 'u1', firstName: 'Alice', lastName: 'A' },
      assetId: 'asset-1',
      assetLabel: 'Riverside Flat',
      metadata: null,
      isPublic: false,
      createdAt: new Date().toISOString(),
    };
    mockListDocuments.mockResolvedValue({ documents: [d], nextCursor: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/riverside flat/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('asset-1')).not.toBeInTheDocument();
  });
});
