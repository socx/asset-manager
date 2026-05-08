import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DocumentsPage from '../DocumentsPage';
import * as docsApi from '../../api/documents';

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

beforeEach(() => {
  mockListDocuments.mockResolvedValue({ documents: [], nextCursor: null });
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
      expect(screen.getByText(/no documents found/i)).toBeInTheDocument();
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
      metadata: null,
      isPublic: false,
      createdAt: new Date().toISOString(),
    };
    mockListDocuments.mockResolvedValue({ documents: [d], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('file.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText('application/pdf')).toBeInTheDocument();
    expect(screen.getByText(/123 bytes/)).toBeInTheDocument();
    expect(screen.getByText(/Alice A/)).toBeInTheDocument();
  });
});
