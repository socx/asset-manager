import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AssetDetailPage from '../AssetDetailPage';

const mockNavigate = vi.fn();

const mockAuthState = {
  accessToken: 'test-token',
  user: { id: 'owner-1', role: 'asset_owner', firstName: 'A', lastName: 'B', email: 'a@b.com' },
};

vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...original,
    useNavigate: () => mockNavigate,
  };
});

const baseAsset = {
  id: 'asset-1',
  code: 'PROP-00001',
  customAlias: null,
  assetClassId: null,
  ownerId: 'owner-1',
  managedByUserId: null,
  managedByCompanyId: null,
  ownershipTypeId: 'ot1',
  addressLine1: '10 Downing Street',
  addressLine2: null,
  city: 'London',
  county: null,
  postCode: 'SW1A 2AA',
  country: 'UK',
  propertyStatusId: 'ps1',
  propertyPurposeId: 'pp1',
  description: 'desc',
  purchaseDate: '2024-01-01T00:00:00.000Z',
  purchasePrice: 500000,
  isFinanced: true,
  depositPaid: 50000,
  dutiesTaxes: 12000,
  legalFees: 3000,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  owner: { id: 'owner-1', firstName: 'Alice', lastName: 'Owner', email: 'alice@example.com' },
  managedByUser: null,
  managedByCompany: null,
  assetClass: null,
  ownershipType: { id: 'ot1', name: 'Sole' },
  propertyStatus: { id: 'ps1', name: 'Active' },
  propertyPurpose: { id: 'pp1', name: 'Residential' },
  valuations: [
    {
      id: 'val-1',
      assetId: 'asset-1',
      valuationDate: '2024-06-01T00:00:00.000Z',
      valuationAmount: 550000,
      valuationMethod: 'Market',
      valuedBy: null,
      notes: null,
      createdAt: '2024-06-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    },
  ],
  mortgages: [
    {
      id: 'mort-1',
      assetId: 'asset-1',
      lender: 'Bank',
      productName: null,
      mortgageTypeId: 'mt1',
      loanAmount: 300000,
      interestRate: null,
      termYears: null,
      paymentStatusId: 'mps1',
      startDate: '2024-01-01T00:00:00.000Z',
      settledAt: null,
      notes: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  shareholdings: [],
  transactions: [],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/assets/asset-1']}>
        <Routes>
          <Route path="/assets/:id" element={<AssetDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.includes('/api/v1/assets/properties/asset-1/transactions')) {
      return {
        ok: true,
        json: async () => ({
          items: [
            { id: 'tx-1', date: '2024-07-01T00:00:00.000Z', description: 'Rent', amount: 1200, categoryId: 'cat1' },
            { id: 'tx-2', date: '2024-05-01T00:00:00.000Z', description: 'Repair', amount: -300, categoryId: 'cat1' },
          ],
          nextCursor: 'tx-2',
        }),
      } as Response;
    }

    if (url.endsWith('/api/v1/assets/properties/asset-1') && method === 'GET') {
      return { ok: true, json: async () => ({ asset: baseAsset }) } as Response;
    }

    if (url.endsWith('/api/v1/assets/properties/asset-1') && method === 'PATCH') {
      return { ok: true, json: async () => ({ asset: { ...baseAsset, description: 'updated' } }) } as Response;
    }

    if (url.endsWith('/api/v1/assets/properties/asset-1') && method === 'DELETE') {
      return { ok: true, json: async () => ({ message: 'deleted' }) } as Response;
    }

    if (url.includes('/valuations') || url.includes('/mortgages') || url.includes('/shareholdings') || url.includes('/transactions')) {
      return { ok: true, json: async () => ({ item: { id: 'new' } }) } as Response;
    }

    return { ok: true, json: async () => ({}) } as Response;
  });
}

describe('AssetDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', makeFetchMock());
    mockAuthState.user = { ...mockAuthState.user, id: 'owner-1', role: 'asset_owner' };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders breadcrumb and tabs', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument());
    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Financials' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shareholding' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transactions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument();
  });

  it('shows current valuation prominently in overview', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Current Valuation/i)).toBeInTheDocument());
    expect(screen.getByText(/£550,000/)).toBeInTheDocument();
  });

  it('distinguishes active mortgage in financials tab', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Financials' }));
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('shows edit and delete controls only for authorized users', async () => {
    const firstRender = renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();

    firstRender.unmount();

    mockAuthState.user = { ...mockAuthState.user, id: 'other-user', role: 'asset_owner' };
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument();
  });

  it('opens direct overview edit form and saves', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith('/api/v1/assets/properties/asset-1') && (init as RequestInit)?.method === 'PATCH');
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it('opens delete modal and confirms delete', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm delete/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/assets'));
  });

  it('shows inline Add buttons in sub-entity sections', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Financials' }));
    expect(screen.getAllByText(/Add/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Shareholding' }));
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Transactions' }));
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument();
  });

  it('renders transaction list with sortable by date control', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Transactions' }));
    await waitFor(() => expect(screen.getByText(/Rent/)).toBeInTheDocument());

    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'asc' } });

    const rows = screen.getAllByText(/Rent|Repair/);
    expect(rows.length).toBeGreaterThan(1);
  });

  it('shows documents placeholder tab', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(screen.getByText(/ITER-5/i)).toBeInTheDocument();
  });
});
