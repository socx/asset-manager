import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AssetsPage from '../AssetsPage';
import * as assetsApi from '../../api/assets';
import * as authStore from '../../store/authStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<assetsApi.PropertyAssetListItem> = {}): assetsApi.PropertyAssetListItem {
  return {
    id: 'asset-1',
    code: 'PROP-001',
    customAlias: null,
    addressLine1: '10 Downing Street',
    addressLine2: null,
    city: 'London',
    county: null,
    postCode: 'SW1A 2AA',
    country: 'GB',
    propertyStatus: { id: 's1', name: 'Active' },
    propertyPurpose: { id: 'p1', name: 'Residential' },
    owner: { id: 'u1', firstName: 'Alice', lastName: 'Smith' },
    managedByUser: null,
    managedByCompany: null,
    valuations: [{ valuationDate: '2024-01-01', valuationAmount: 500000 }],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string }) => unknown) =>
    selector({ accessToken: 'test-token' }),
}));

const mockListPropertyAssets = vi.spyOn(assetsApi, 'listPropertyAssets');

beforeEach(() => {
  mockListPropertyAssets.mockResolvedValue({ assets: [], nextCursor: null });
  try { localStorage.clear(); } catch { /* ignore */ }
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssetsPage', () => {
  it('shows loading state initially', () => {
    mockListPropertyAssets.mockReturnValue(new Promise(() => { /* pending */ }));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading assets');
  });

  it('renders empty state when no assets returned', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no assets yet/i)).toBeInTheDocument();
    });
  });

  it('renders asset rows in table view', async () => {
    mockListPropertyAssets.mockResolvedValue({ assets: [makeAsset()], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('PROP-001')).toBeInTheDocument();
    });
    expect(screen.getByText(/10 Downing Street/)).toBeInTheDocument();
    expect(screen.getByText('Residential')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows customAlias when set instead of code', async () => {
    mockListPropertyAssets.mockResolvedValue({
      assets: [makeAsset({ customAlias: 'My House' })],
      nextCursor: null,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('My House').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('PROP-001')).not.toBeInTheDocument();
  });

  it('switches to tile view and persists to localStorage', async () => {
    mockListPropertyAssets.mockResolvedValue({ assets: [makeAsset()], nextCursor: null });
    renderPage();
    await waitFor(() => screen.getByText('PROP-001'));

    const tileBtn = screen.getByRole('button', { name: /tile view/i });
    fireEvent.click(tileBtn);

    // Table should be gone, tile is visible
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(localStorage.getItem('asset-view-mode')).toBe('tile');
  });

  it('restores tile view from localStorage', async () => {
    localStorage.setItem('asset-view-mode', 'tile');
    mockListPropertyAssets.mockResolvedValue({ assets: [makeAsset()], nextCursor: null });
    renderPage();
    await waitFor(() => screen.getByText('PROP-001'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('passes search query to API', async () => {
    renderPage();
    await waitFor(() => screen.getByText(/no assets yet/i));

    const input = screen.getByPlaceholderText(/search by code/i);
    fireEvent.change(input, { target: { value: 'London' } });

    await waitFor(() => {
      const calls = mockListPropertyAssets.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].q).toBe('London');
    }, { timeout: 1000 });
  });

  it('shows empty state with search hint when search returns nothing', async () => {
    renderPage();
    await waitFor(() => screen.getByText(/no assets yet/i));

    const input = screen.getByPlaceholderText(/search by code/i);
    fireEvent.change(input, { target: { value: 'xyz' } });

    await waitFor(() => {
      expect(screen.getByText(/no assets match your search/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('shows error state when API call fails', async () => {
    mockListPropertyAssets.mockRejectedValue(new Error('network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load assets/i)).toBeInTheDocument();
    });
  });

  it('formats GBP valuation in table row', async () => {
    mockListPropertyAssets.mockResolvedValue({ assets: [makeAsset()], nextCursor: null });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/£500,000/)).toBeInTheDocument();
    });
  });

  it('renders Register New Asset button', async () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /register new asset/i });
    expect(btn).toBeEnabled();
  });
});
