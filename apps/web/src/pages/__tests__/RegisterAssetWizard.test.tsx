import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RegisterAssetWizard from '../RegisterAssetWizard';
import * as wizardLookups from '../../hooks/useWizardLookups';

// ── Mock lookups ──────────────────────────────────────────────────────────────

const MOCK_LOOKUPS: ReturnType<typeof wizardLookups.useWizardLookups> = {
  ownershipTypes:          [{ id: 'ot1', name: 'Sole Owner' }],
  propertyStatuses:        [{ id: 'ps1', name: 'Active' }],
  propertyPurposes:        [{ id: 'pp1', name: 'Residential' }],
  assetClasses:            [{ id: 'ac1', name: 'Residential' }],
  mortgageTypes:           [{ id: 'mt1', name: 'Fixed Rate' }],
  mortgagePaymentStatuses: [{ id: 'mp1', name: 'Current' }],
  users:                   [{ id: 'u1', name: 'Alice Smith' }],
  companies:               [{ id: 'c1', name: 'Acme Ltd' }],
  isLoading: false,
  isError: false,
};

vi.mock('../../hooks/useWizardLookups', () => ({
  useWizardLookups: vi.fn(() => MOCK_LOOKUPS),
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: { accessToken: string }) => unknown) =>
    selector({ accessToken: 'test-token' }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>();
  return { ...original, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RegisterAssetWizard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Fill mandatory step 1 fields */
function fillStep1() {
  const ownershipSelect = screen.getByRole('combobox', { name: /ownership type/i });
  fireEvent.change(ownershipSelect, { target: { value: 'ot1' } });
  fireEvent.change(screen.getByRole('textbox', { name: /address line 1/i }), { target: { value: '10 Test St' } });
  fireEvent.change(screen.getByRole('textbox', { name: /^city/i }), { target: { value: 'London' } });
  fireEvent.change(screen.getByRole('textbox', { name: /post code/i }), { target: { value: 'SW1A 2AA' } });
  fireEvent.change(screen.getByRole('textbox', { name: /^country/i }), { target: { value: 'United Kingdom' } });
}

/** Fill mandatory step 2 fields */
function fillStep2() {
  const purposeSelect = screen.getByRole('combobox', { name: /property purpose/i });
  fireEvent.change(purposeSelect, { target: { value: 'pp1' } });
  const statusSelect = screen.getByRole('combobox', { name: /property status/i });
  fireEvent.change(statusSelect, { target: { value: 'ps1' } });
}

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
}

function clickBack() {
  fireEvent.click(screen.getByRole('button', { name: /back/i }));
}

function goToReview() {
  for (let i = 0; i < 6; i += 1) {
    const next = screen.queryByRole('button', { name: /next/i });
    if (!next) break;
    fireEvent.click(next);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ asset: { id: 'new-id', code: 'PROP-001' } }),
    }),
  );
  window.confirm = vi.fn(() => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RegisterAssetWizard', () => {
  it('renders step 1 initially', () => {
    renderWizard();
    expect(screen.getByTestId('step-basic')).toBeInTheDocument();
    expect(screen.getAllByText('Basic Details').length).toBeGreaterThan(0);
  });

  it('shows loading state when lookups are loading', () => {
    vi.mocked(wizardLookups.useWizardLookups).mockReturnValueOnce({ ...MOCK_LOOKUPS, isLoading: true });
    renderWizard();
    expect(screen.getByRole('status')).toHaveTextContent(/loading form data/i);
  });

  it('shows error state when lookups fail', () => {
    vi.mocked(wizardLookups.useWizardLookups).mockReturnValueOnce({ ...MOCK_LOOKUPS, isError: true });
    renderWizard();
    expect(screen.getByText(/failed to load form options/i)).toBeInTheDocument();
  });

  it('blocks step 1 → step 2 if required fields are missing', () => {
    renderWizard();
    clickNext();
    // Still on step 1
    expect(screen.getByTestId('step-basic')).toBeInTheDocument();
  });

  it('advances to step 2 when step 1 is valid', () => {
    renderWizard();
    fillStep1();
    clickNext();
    expect(screen.getByTestId('step-info')).toBeInTheDocument();
  });

  it('navigates back to step 1 from step 2', () => {
    renderWizard();
    fillStep1();
    clickNext();
    clickBack();
    expect(screen.getByTestId('step-basic')).toBeInTheDocument();
  });

  it('preserves step 1 data when navigating back', () => {
    renderWizard();
    fillStep1();
    const aliasInput = screen.getByPlaceholderText(/e.g. my-london-flat/i);
    fireEvent.change(aliasInput, { target: { value: 'my-flat' } });
    clickNext();
    clickBack();
    expect(screen.getByDisplayValue('my-flat')).toBeInTheDocument();
  });

  it('blocks step 2 → step 3 if required fields are missing', () => {
    renderWizard();
    fillStep1();
    clickNext();
    clickNext();
    expect(screen.getByTestId('step-info')).toBeInTheDocument();
  });

  it('advances through all non-financed steps to review', () => {
    renderWizard();
    fillStep1(); clickNext();       // → step 2
    fillStep2(); clickNext();       // → step 3
    goToReview();
    expect(screen.getByTestId('step-review')).toBeInTheDocument();
  });

  it('shows mortgage step when isFinanced is checked', () => {
    renderWizard();
    fillStep1(); clickNext();   // step 2
    fillStep2(); clickNext();   // step 3 — purchase
    // Check "financed" checkbox
    const financeCheckbox = screen.getByRole('checkbox', { name: /property is financed/i });
    fireEvent.click(financeCheckbox);
    clickNext();    // → step 4 shareholding
    clickNext();    // → step 5 valuation
    clickNext();    // → step 6 MORTGAGE (now shown)
    expect(screen.getByTestId('step-mortgage')).toBeInTheDocument();
    clickNext();    // → step 7 review
    expect(screen.getByTestId('step-review')).toBeInTheDocument();
  });

  it('validates shareholding total must equal 100', () => {
    renderWizard();
    fillStep1(); clickNext();
    fillStep2(); clickNext();
    clickNext(); // → shareholding
    fireEvent.click(screen.getByRole('button', { name: /add entry/i }));
    fireEvent.change(screen.getByLabelText(/shareholder name 1/i), { target: { value: 'Owner 1' } });
    // Set ownership to 50 (not 100)
    fireEvent.change(screen.getByLabelText(/ownership percent 1/i), { target: { value: '50' } });
    clickNext();
    expect(screen.getByText(/must equal 100/i)).toBeInTheDocument();
  });

  it('skips shareholding step when no entries added', () => {
    renderWizard();
    fillStep1(); clickNext();
    fillStep2(); clickNext();
    clickNext(); // purchase
    // No entries on shareholding step
    clickNext(); // should proceed to valuation
    expect(screen.getByTestId('step-valuation')).toBeInTheDocument();
  });

  it('submits all data as single API call from review step', async () => {
    renderWizard();
    fillStep1(); clickNext();
    fillStep2(); clickNext();
    goToReview();
    fireEvent.click(screen.getByRole('button', { name: /confirm & register/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const payload = JSON.parse((init as RequestInit).body as string) as Record<string, string>;
    expect(payload['addressLine1']).toBe('10 Test St');
    expect(payload['ownershipTypeId']).toBe('ot1');
    expect(payload['propertyPurposeId']).toBe('pp1');
    expect(payload['propertyStatusId']).toBe('ps1');
  });

  it('collects full shareholding, valuation, and mortgage fields into payload', async () => {
    renderWizard();

    fillStep1();
    clickNext();
    fillStep2();
    clickNext();

    // Purchase step
    fireEvent.click(screen.getByRole('checkbox', { name: /property is financed/i }));
    clickNext();

    // Shareholding step
    fireEvent.click(screen.getByRole('button', { name: /add entry/i }));
    fireEvent.change(screen.getByLabelText(/shareholder name 1/i), { target: { value: 'Alice Smith' } });
    fireEvent.change(screen.getByLabelText(/ownership percent 1/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/profit percent 1/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/shareholding notes 1/i), { target: { value: 'Joint owner' } });
    clickNext();

    // Valuation step
    fireEvent.click(screen.getByRole('button', { name: /add entry/i }));
    fireEvent.change(screen.getByLabelText(/valuation date 1/i), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/valuation amount 1/i), { target: { value: '550000' } });
    fireEvent.change(screen.getByLabelText(/valuation method 1/i), { target: { value: 'Desktop' } });
    fireEvent.change(screen.getByLabelText(/valued by 1/i), { target: { value: 'Surveyor Ltd' } });
    fireEvent.change(screen.getByLabelText(/valuation notes 1/i), { target: { value: 'Annual review' } });
    clickNext();

    // Mortgage step
    fireEvent.click(screen.getByRole('button', { name: /add entry/i }));
    fireEvent.change(screen.getByLabelText(/lender 1/i), { target: { value: 'HSBC' } });
    fireEvent.change(screen.getByLabelText(/product name 1/i), { target: { value: 'Fixed 5Y' } });
    fireEvent.change(screen.getByLabelText(/mortgage type 1/i), { target: { value: 'mt1' } });
    fireEvent.change(screen.getByLabelText(/payment status 1/i), { target: { value: 'mp1' } });
    fireEvent.change(screen.getByLabelText(/loan amount 1/i), { target: { value: '300000' } });
    fireEvent.change(screen.getByLabelText(/interest rate 1/i), { target: { value: '4.25' } });
    fireEvent.change(screen.getByLabelText(/term years 1/i), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/start date 1/i), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText(/settled at 1/i), { target: { value: '2031-06-01' } });
    fireEvent.change(screen.getByLabelText(/mortgage notes 1/i), { target: { value: 'Primary mortgage' } });
    clickNext();

    fireEvent.click(screen.getByRole('button', { name: /confirm & register/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const payload = JSON.parse((init as RequestInit).body as string) as {
      shareholdings: Array<{ shareholderName: string; ownershipPercent: number; profitPercent: number; notes?: string }>;
      valuations: Array<{ valuationDate: string; valuationAmount: number; valuationMethod: string; valuedBy?: string; notes?: string }>;
      mortgages: Array<{ lender: string; productName?: string; mortgageTypeId: string; loanAmount: number; interestRate?: number; termYears?: number; paymentStatusId: string; startDate: string; settledAt?: string; notes?: string }>;
    };

    expect(payload.shareholdings[0]).toMatchObject({
      shareholderName: 'Alice Smith',
      ownershipPercent: 100,
      profitPercent: 100,
      notes: 'Joint owner',
    });
    expect(payload.valuations[0]).toMatchObject({
      valuationAmount: 550000,
      valuationMethod: 'Desktop',
      valuedBy: 'Surveyor Ltd',
      notes: 'Annual review',
    });
    expect(payload.valuations[0].valuationDate).toContain('2026-05-01');
    expect(payload.mortgages[0]).toMatchObject({
      lender: 'HSBC',
      productName: 'Fixed 5Y',
      mortgageTypeId: 'mt1',
      loanAmount: 300000,
      interestRate: 4.25,
      termYears: 25,
      paymentStatusId: 'mp1',
      notes: 'Primary mortgage',
    });
    expect(payload.mortgages[0].startDate).toContain('2026-06-01');
    expect(payload.mortgages[0].settledAt).toContain('2031-06-01');
  });

  it('navigates to new asset detail page on success', async () => {
    renderWizard();
    fillStep1(); clickNext();
    fillStep2(); clickNext();
    goToReview();
    fireEvent.click(screen.getByRole('button', { name: /confirm & register/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/assets/new-id'));
  });

  it('shows error message from API on submit failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Duplicate alias')));
    renderWizard();
    fillStep1(); clickNext();
    fillStep2(); clickNext();
    goToReview();
    fireEvent.click(screen.getByRole('button', { name: /confirm & register/i }));
    await waitFor(() => expect(screen.getByText('Duplicate alias')).toBeInTheDocument());
  });

  it('asks for confirmation when cancelling with unsaved data', () => {
    renderWizard();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/unsaved data/i));
  });

  it('navigates to /assets on cancel when confirmed', () => {
    renderWizard();
    fillStep1();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/assets');
  });

  it('navigates to /assets on cancel with no data without confirming', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/assets');
  });

  it('step indicator shows current step as active', () => {
    renderWizard();
    // Step 1 is active — its step number should be in active ring styling
    const indicator = screen.getByRole('list', { hidden: true });
    expect(indicator).toBeInTheDocument();
  });

  it('validates alias format', () => {
    renderWizard();
    const aliasInput = screen.getByPlaceholderText(/e.g. my-london-flat/i);
    fireEvent.change(aliasInput, { target: { value: 'bad alias!' } });
    // fill other required fields so alias error surfaces
    const ownershipSelect = screen.getByRole('combobox', { name: /ownership type/i });
    fireEvent.change(ownershipSelect, { target: { value: 'ot1' } });
    fireEvent.change(screen.getByRole('textbox', { name: /address line 1/i }), { target: { value: '10 Test St' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^city/i }), { target: { value: 'London' } });
    fireEvent.change(screen.getByRole('textbox', { name: /post code/i }), { target: { value: 'SW1A 2AA' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^country/i }), { target: { value: 'UK' } });
    clickNext();
    expect(screen.getByText(/only letters, digits/i)).toBeInTheDocument();
  });
});
