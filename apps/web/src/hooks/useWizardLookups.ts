/**
 * Fetches all lookup lists needed by the property registration wizard in
 * parallel and returns them as labelled arrays of { id, name }.
 */
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/auth';

interface LookupItem {
  id: string;
  type: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

interface WizardUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface WizardCompany {
  id: string;
  name: string;
  companyType?: { id: string; name: string } | null;
}

export interface LookupOption {
  id: string;
  name: string;
}

interface WizardLookups {
  ownershipTypes: LookupOption[];
  propertyStatuses: LookupOption[];
  propertyPurposes: LookupOption[];
  assetClasses: LookupOption[];
  mortgageTypes: LookupOption[];
  mortgagePaymentStatuses: LookupOption[];
  users: LookupOption[];
  companies: LookupOption[];
  isLoading: boolean;
  isError: boolean;
}

function toOption(item: LookupItem): LookupOption {
  return { id: item.id, name: item.name };
}

function listLookupItems(type: string, accessToken: string): Promise<{ items: LookupItem[] }> {
  return apiRequest<{ items: LookupItem[] }>(`/lookup/${type}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function listWizardUsers(accessToken: string): Promise<{ users: WizardUser[] }> {
  try {
    return await apiRequest<{ users: WizardUser[] }>('/admin/users?limit=200&status=active', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { users: [] };
  }
}

async function listWizardCompanies(accessToken: string): Promise<{ companies: WizardCompany[] }> {
  try {
    return await apiRequest<{ companies: WizardCompany[] }>('/companies', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { companies: [] };
  }
}

export function useWizardLookups(accessToken: string): WizardLookups {
  const opts = { enabled: !!accessToken };

  const ownershipQ = useQuery({
    queryKey: ['lookup', 'ownership_type'],
    queryFn: () => listLookupItems('ownership_type', accessToken),
    ...opts,
  });
  const statusQ = useQuery({
    queryKey: ['lookup', 'property_status'],
    queryFn: () => listLookupItems('property_status', accessToken),
    ...opts,
  });
  const purposeQ = useQuery({
    queryKey: ['lookup', 'property_purpose'],
    queryFn: () => listLookupItems('property_purpose', accessToken),
    ...opts,
  });
  const assetClassQ = useQuery({
    queryKey: ['lookup', 'asset_class'],
    queryFn: () => listLookupItems('asset_class', accessToken),
    ...opts,
  });
  const mortgageTypeQ = useQuery({
    queryKey: ['lookup', 'mortgage_type'],
    queryFn: () => listLookupItems('mortgage_type', accessToken),
    ...opts,
  });
  const mortgagePaymentStatusQ = useQuery({
    queryKey: ['lookup', 'mortgage_payment_status'],
    queryFn: () => listLookupItems('mortgage_payment_status', accessToken),
    ...opts,
  });
  const usersQ = useQuery({
    queryKey: ['wizard', 'users'],
    queryFn: () => listWizardUsers(accessToken),
    ...opts,
  });
  const companiesQ = useQuery({
    queryKey: ['wizard', 'companies'],
    queryFn: () => listWizardCompanies(accessToken),
    ...opts,
  });

  const isLoading = [ownershipQ, statusQ, purposeQ, assetClassQ, mortgageTypeQ, mortgagePaymentStatusQ].some((q) => q.isLoading);
  const isError = [ownershipQ, statusQ, purposeQ, assetClassQ, mortgageTypeQ, mortgagePaymentStatusQ].some((q) => q.isError);

  return {
    ownershipTypes: (ownershipQ.data?.items ?? []).filter((i) => i.isActive !== false).map(toOption),
    propertyStatuses: (statusQ.data?.items ?? []).filter((i) => i.isActive !== false).map(toOption),
    propertyPurposes: (purposeQ.data?.items ?? []).filter((i) => i.isActive !== false).map(toOption),
    assetClasses: (assetClassQ.data?.items ?? []).filter((i) => i.isActive !== false).map(toOption),
    mortgageTypes: (mortgageTypeQ.data?.items ?? []).filter((i) => i.isActive !== false).map(toOption),
    mortgagePaymentStatuses: (mortgagePaymentStatusQ.data?.items ?? []).filter((i) => i.isActive !== false).map(toOption),
    users: (usersQ.data?.users ?? []).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email })),
    companies: (companiesQ.data?.companies ?? []).map((c) => ({ id: c.id, name: c.name })),
    isLoading,
    isError,
  };
}
