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

export interface ListAssetsParams {
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface ListAssetsResponse {
  assets: PropertyAssetListItem[];
  nextCursor: string | null;
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
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

  // ── Wizard sub-entity payloads ─────────────────────────────────────────────

  export interface CreateValuationPayload {
    valuationDate: string;       // ISO datetime
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
    startDate: string;           // ISO datetime
    settledAt?: string;
    notes?: string;
  }

  export interface CreateShareholdingPayload {
    shareholderName: string;
    ownershipPercent: number;
    profitPercent: number;
    notes?: string;
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

  export function createPropertyAsset(
    payload: CreatePropertyAssetPayload,
    accessToken: string,
  ): Promise<CreatePropertyAssetResponse> {
    return apiRequest<CreatePropertyAssetResponse>('/assets/properties', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
