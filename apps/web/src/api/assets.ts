import { apiRequest } from './auth';

export interface AssetUser {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AssetCompany {
  id: string;
  name: string;
}

export interface AssetLookup {
  id: string;
  name: string;
}

export interface AssetLookupNullable {
  id: string;
  name: string;
}

export interface AssetValuationSnap {
  valuationDate: string;
  valuationAmount: number;
}

export interface PropertyAssetListItem {
  id: string;
  code: string;
  customAlias: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  county: string | null;
  postCode: string;
  country: string;
  propertyStatus: AssetLookup | null;
  propertyPurpose: AssetLookup | null;
  owner: AssetUser | null;
  managedByUser: AssetUser | null;
  managedByCompany: AssetCompany | null;
  valuations: AssetValuationSnap[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetOwnerDetail extends AssetUser {
  email: string;
}

export interface ValuationEntry {
  id: string;
  assetId: string;
  valuationDate: string;
  valuationAmount: number | string;
  valuationMethod: string;
  valuedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MortgageEntry {
  id: string;
  assetId: string;
  lender: string;
  productName: string | null;
  mortgageTypeId: string;
  loanAmount: number | string;
  interestRate: number | string | null;
  termYears: number | null;
  paymentStatusId: string;
  startDate: string;
  settledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShareholdingEntry {
  id: string;
  assetId: string;
  shareholderName: string;
  ownershipPercent: number | string;
  profitPercent: number | string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionEntry {
  id: string;
  assetId: string;
  date: string;
  description: string;
  amount: number | string;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyAssetDetail {
  id: string;
  code: string;
  customAlias: string | null;
  assetClassId: string | null;
  ownerId: string;
  managedByUserId: string | null;
  managedByCompanyId: string | null;
  ownershipTypeId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  county: string | null;
  postCode: string;
  country: string;
  propertyStatusId: string;
  propertyPurposeId: string;
  description: string | null;
  purchaseDate: string | null;
  purchasePrice: number | string | null;
  isFinanced: boolean | null;
  depositPaid: number | string | null;
  dutiesTaxes: number | string | null;
  legalFees: number | string | null;
  createdAt: string;
  updatedAt: string;
  owner: AssetOwnerDetail | null;
  managedByUser: AssetOwnerDetail | null;
  managedByCompany: AssetCompany | null;
  assetClass: AssetLookupNullable | null;
  ownershipType: AssetLookupNullable | null;
  propertyStatus: AssetLookupNullable | null;
  propertyPurpose: AssetLookupNullable | null;
  valuations: ValuationEntry[];
  mortgages: MortgageEntry[];
  shareholdings: ShareholdingEntry[];
  transactions: TransactionEntry[];
}

export interface ListAssetsParams {
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface ListAssetsResponse {
  assets: PropertyAssetListItem[];
  nextCursor: string | null;
}

export interface ListTransactionsParams {
  cursor?: string;
  limit?: number;
}

export interface ListTransactionsResponse {
  items: TransactionEntry[];
  nextCursor: string | null;
}

export interface AssetDetailResponse {
  asset: PropertyAssetDetail;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export function listPropertyAssets(
  params: ListAssetsParams,
  accessToken: string,
): Promise<ListAssetsResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiRequest<ListAssetsResponse>(`/assets/properties${query}`, {
    headers: authHeaders(accessToken),
  });
}

// ── Create payloads ───────────────────────────────────────────────────────────

export interface CreateValuationPayload {
  valuationDate: string;
  valuationAmount: number;
  valuationMethod: string;
  valuedBy?: string;
  notes?: string;
}

export interface CreateMortgagePayload {
  lender: string;
  productName?: string;
  mortgageTypeId: string;
  loanAmount: number;
  interestRate?: number;
  termYears?: number;
  paymentStatusId: string;
  startDate: string;
  settledAt?: string;
  notes?: string;
}

export interface CreateShareholdingPayload {
  shareholderName: string;
  ownershipPercent: number;
  profitPercent: number;
  notes?: string;
}

export interface CreateTransactionPayload {
  date: string;
  description: string;
  amount: number;
  categoryId: string;
}

export interface CreatePropertyAssetPayload {
  customAlias?: string;
  assetClassId?: string;
  ownerId?: string;
  managedByUserId?: string | null;
  managedByCompanyId?: string | null;
  ownershipTypeId: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  county?: string;
  postCode: string;
  country: string;
  propertyStatusId: string;
  propertyPurposeId: string;
  description?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  isFinanced?: boolean;
  depositPaid?: number;
  dutiesTaxes?: number;
  legalFees?: number;
  valuations?: CreateValuationPayload[];
  mortgages?: CreateMortgagePayload[];
  shareholdings?: CreateShareholdingPayload[];
}

export interface CreatePropertyAssetResponse {
  asset: { id: string; code: string };
}

export function createPropertyAsset(payload: CreatePropertyAssetPayload, accessToken: string): Promise<CreatePropertyAssetResponse> {
  return apiRequest<CreatePropertyAssetResponse>('/assets/properties', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: authHeaders(accessToken),
  });
}

// ── Detail + mutators ─────────────────────────────────────────────────────────

export function getPropertyAssetDetail(id: string, accessToken: string): Promise<AssetDetailResponse> {
  return apiRequest<AssetDetailResponse>(`/assets/properties/${id}`, {
    headers: authHeaders(accessToken),
  });
}

export function updatePropertyAsset(id: string, payload: Partial<CreatePropertyAssetPayload>, accessToken: string): Promise<AssetDetailResponse> {
  return apiRequest<AssetDetailResponse>(`/assets/properties/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: authHeaders(accessToken),
  });
}

export function deletePropertyAsset(id: string, accessToken: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/assets/properties/${id}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

// ── Sub-entity lists ──────────────────────────────────────────────────────────

export function listValuations(assetId: string, accessToken: string): Promise<{ items: ValuationEntry[] }> {
  return apiRequest<{ items: ValuationEntry[] }>(`/assets/properties/${assetId}/valuations`, {
    headers: authHeaders(accessToken),
  });
}

export function listMortgages(assetId: string, accessToken: string): Promise<{ items: MortgageEntry[] }> {
  return apiRequest<{ items: MortgageEntry[] }>(`/assets/properties/${assetId}/mortgages`, {
    headers: authHeaders(accessToken),
  });
}

export function listShareholdings(assetId: string, accessToken: string): Promise<{ items: ShareholdingEntry[] }> {
  return apiRequest<{ items: ShareholdingEntry[] }>(`/assets/properties/${assetId}/shareholdings`, {
    headers: authHeaders(accessToken),
  });
}

export function listTransactions(assetId: string, params: ListTransactionsParams, accessToken: string): Promise<ListTransactionsResponse> {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiRequest<ListTransactionsResponse>(`/assets/properties/${assetId}/transactions${query}`, {
    headers: authHeaders(accessToken),
  });
}

// ── Sub-entity creates ────────────────────────────────────────────────────────

export function createValuation(assetId: string, payload: CreateValuationPayload, accessToken: string): Promise<{ item: ValuationEntry }> {
  return apiRequest<{ item: ValuationEntry }>(`/assets/properties/${assetId}/valuations`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: authHeaders(accessToken),
  });
}

export function createMortgage(assetId: string, payload: CreateMortgagePayload, accessToken: string): Promise<{ item: MortgageEntry }> {
  return apiRequest<{ item: MortgageEntry }>(`/assets/properties/${assetId}/mortgages`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: authHeaders(accessToken),
  });
}

export function createShareholding(assetId: string, payload: CreateShareholdingPayload, accessToken: string): Promise<{ item: ShareholdingEntry }> {
  return apiRequest<{ item: ShareholdingEntry }>(`/assets/properties/${assetId}/shareholdings`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: authHeaders(accessToken),
  });
}

export function createTransaction(assetId: string, payload: CreateTransactionPayload, accessToken: string): Promise<{ item: TransactionEntry }> {
  return apiRequest<{ item: TransactionEntry }>(`/assets/properties/${assetId}/transactions`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: authHeaders(accessToken),
  });
}
