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
