import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ActionBody = Record<string, unknown> & { action: string };

async function callQbo<T = any>(body: ActionBody): Promise<T> {
  const { data, error } = await supabase.functions.invoke('qbo-customer-sync', { body });
  if (error) throw new Error(error.message);
  if (!(data as any)?.ok) throw new Error((data as any)?.error ?? 'QBO call failed');
  return (data as any).result as T;
}

export type QboCustomer = {
  id: string;
  display_name: string;
  company_name?: string | null;
  email: string | null;
  balance: number;
  active: boolean;
  currency: string | null;
  sync_token: string | null;
  score?: number;
  match_type?: string;
};

export type QboCustomerSuggestion = {
  id: string;
  display_name: string;
  email: string | null;
  balance: number;
  score: number;
  matched_by?: 'name' | 'email';
};

export function useQboCustomerSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['qbo', 'customer-search', q],
    enabled: enabled && q.trim().length >= 2,
    queryFn: () => callQbo<{ customers: QboCustomer[] }>({ action: 'search', q }).then((r) => r.customers),
  });
}

export function useQboCustomerSuggestions(
  crmOrgId: string | undefined,
  enabled: boolean,
  email?: string | null,
) {
  return useQuery({
    queryKey: ['qbo', 'customer-suggest', crmOrgId, email ?? null],
    enabled: !!crmOrgId && enabled,
    staleTime: 60_000,
    queryFn: () =>
      callQbo<{ suggestions: QboCustomerSuggestion[] }>({
        action: 'suggest',
        crm_organization_id: crmOrgId,
        email: email ?? null,
      }).then((r) => r.suggestions),
  });
}

export function useQboLinkCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { crm_organization_id: string; qbo_customer_id: string }) =>
      callQbo({ action: 'link', ...input }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      qc.invalidateQueries({ queryKey: ['crm', 'organization', vars.crm_organization_id] });
      qc.invalidateQueries({ queryKey: ['qbo', 'invoice-preview'] });
      toast.success('Linked to QuickBooks customer');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      crm_organization_id: string;
      display_name?: string;
      company_name?: string | null;
      email?: string | null;
      phone?: string | null;
      website?: string | null;
      billing_address?: {
        line1?: string | null;
        city?: string | null;
        region?: string | null;
        postal_code?: string | null;
        country?: string | null;
      } | null;
    }) => callQbo<{ qbo_customer_id: string }>({ action: 'create', ...input }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      qc.invalidateQueries({ queryKey: ['crm', 'organization', vars.crm_organization_id] });
      qc.invalidateQueries({ queryKey: ['qbo', 'invoice-preview'] });
      toast.success('Created QuickBooks customer');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboUnlinkCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { crm_organization_id: string }) =>
      callQbo({ action: 'unlink', ...input }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      qc.invalidateQueries({ queryKey: ['crm', 'organization', vars.crm_organization_id] });
      toast.success('QuickBooks link removed');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboRefreshOne() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { crm_organization_id: string }) =>
      callQbo({ action: 'refresh-one', ...input }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      qc.invalidateQueries({ queryKey: ['crm', 'organization', vars.crm_organization_id] });
      toast.success('Balance refreshed');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboRefreshAllBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { only_active?: boolean } = { only_active: true }) =>
      callQbo<{ updated: number; errors: number; total: number }>({ action: 'refresh-balances', ...input }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      qc.invalidateQueries({ queryKey: ['qbo', 'sync-runs'] });
      if (r.errors === 0) toast.success(`Refreshed ${r.updated} of ${r.total} customers`);
      else toast.warning(`Refreshed ${r.updated}, ${r.errors} error(s)`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}
