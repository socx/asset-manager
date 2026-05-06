/**
 * Fetches all lookup lists needed by the property registration wizard in
 * parallel and returns them as labelled arrays of { id, name }.
 */
import { useQuery } from '@tanstack/react-query';
import { listAdminLookupItems, listAdminCompanies, listUsers, type LookupItem } from '../api/admin';

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

export function useWizardLookups(accessToken: string): WizardLookups {
  const opts = { enabled: !!accessToken };

  const ownershipQ = useQuery({
    queryKey: ['lookup', 'ownership_type'],
    queryFn: () => listAdminLookupItems('ownership_type', accessToken),
    ...opts,
  });
  const statusQ = useQuery({
    queryKey: ['lookup', 'property_status'],
    queryFn: () => listAdminLookupItems('property_status', accessToken),
    ...opts,
  });
  const purposeQ = useQuery({
    queryKey: ['lookup', 'property_purpose'],
    queryFn: () => listAdminLookupItems('property_purpose', accessToken),
    ...opts,
  });
  const assetClassQ = useQuery({
    queryKey: ['lookup', 'asset_class'],
    queryFn: () => listAdminLookupItems('asset_class', accessToken),
    ...opts,
  });
  const mortgageTypeQ = useQuery({
    queryKey: ['lookup', 'mortgage_type'],
    queryFn: () => listAdminLookupItems('mortgage_type', accessToken),
    ...opts,
  });
  const mortgagePaymentStatusQ = useQuery({
    queryKey: ['lookup', 'mortgage_payment_status'],
    queryFn: () => listAdminLookupItems('mortgage_payment_status', accessToken),
    ...opts,
  });
  const usersQ = useQuery({
    queryKey: ['admin-users-all'],
    queryFn: () => listUsers({ limit: 200, status: 'active' }, accessToken),
    ...opts,
  });
  const companiesQ = useQuery({
    queryKey: ['admin-companies-all'],
    queryFn: () => listAdminCompanies({ limit: 200 }, accessToken),
    ...opts,
  });

  const isLoading = [ownershipQ, statusQ, purposeQ, assetClassQ, mortgageTypeQ, mortgagePaymentStatusQ, usersQ, companiesQ].some((q) => q.isLoading);
  const isError   = [ownershipQ, statusQ, purposeQ, assetClassQ, mortgageTypeQ, mortgagePaymentStatusQ, usersQ, companiesQ].some((q) => q.isError);

  return {
    ownershipTypes:         (ownershipQ.data?.items ?? []).filter((i) => i.isActive).map(toOption),
    propertyStatuses:       (statusQ.data?.items ?? []).filter((i) => i.isActive).map(toOption),
    propertyPurposes:       (purposeQ.data?.items ?? []).filter((i) => i.isActive).map(toOption),
    assetClasses:           (assetClassQ.data?.items ?? []).filter((i) => i.isActive).map(toOption),
    mortgageTypes:          (mortgageTypeQ.data?.items ?? []).filter((i) => i.isActive).map(toOption),
    mortgagePaymentStatuses:(mortgagePaymentStatusQ.data?.items ?? []).filter((i) => i.isActive).map(toOption),
    users:    (usersQ.data?.users ?? []).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` })),
    companies:(companiesQ.data?.companies ?? []).map((c) => ({ id: c.id, name: c.name })),
    isLoading,
    isError,
  };
}
