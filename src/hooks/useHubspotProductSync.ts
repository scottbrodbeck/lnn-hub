import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type HubspotProduct = {
  id: string;
  name: string;
  price: string | null;
  description: string | null;
  sku: string | null;
  recurring: string | null;
  linked: boolean;
};

export type HubspotProductLink = {
  id: string;
  crm_product_id: string;
  hubspot_product_id: string;
  hubspot_name: string | null;
  hubspot_price: number | null;
  linked_at: string;
  last_pushed_at: string | null;
  last_push_status: string | null;
  last_push_error: string | null;
};

async function invoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('crm-hubspot-product-sync', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useHubspotProducts(enabled: boolean) {
  return useQuery({
    queryKey: ['hubspot', 'products'],
    queryFn: () => invoke<{ items: HubspotProduct[]; total: number }>('list_hubspot_products'),
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubspotProductLinks() {
  return useQuery({
    queryKey: ['hubspot', 'links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_product_hubspot_links')
        .select('*')
        .order('linked_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as HubspotProductLink[];
    },
  });
}

export function useHubspotGlobalToggle() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['hubspot', 'global-toggle'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_settings')
        .select('value')
        .eq('key', 'hubspot_sync_globally_enabled')
        .maybeSingle();
      if (error) throw error;
      return data?.value === true;
    },
  });
  const mutate = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('crm_settings')
        .upsert({ key: 'hubspot_sync_globally_enabled', value: enabled as any });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hubspot', 'global-toggle'] }),
    onError: (e: Error) => toast.error(`Failed to update toggle: ${e.message}`),
  });
  return { ...query, setEnabled: mutate.mutate, isUpdating: mutate.isPending };
}

export function useLinkHubspotProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { crmProductId: string; hubspotProductId: string; hubspotName?: string | null; hubspotPrice?: number | null }) =>
      invoke('link', {
        crm_product_id: vars.crmProductId,
        hubspot_product_id: vars.hubspotProductId,
        hubspot_name: vars.hubspotName ?? null,
        hubspot_price: vars.hubspotPrice ?? null,
      }),
    onSuccess: () => {
      toast.success('Linked to HubSpot product');
      qc.invalidateQueries({ queryKey: ['hubspot'] });
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
    },
    onError: (e: Error) => toast.error(`Link failed: ${e.message}`),
  });
}

export function useUnlinkHubspotProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (crmProductId: string) => invoke('unlink', { crm_product_id: crmProductId }),
    onSuccess: () => {
      toast.success('Unlinked');
      qc.invalidateQueries({ queryKey: ['hubspot'] });
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
    },
    onError: (e: Error) => toast.error(`Unlink failed: ${e.message}`),
  });
}

export function useToggleProductSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { crmProductId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('crm_products')
        .update({ hubspot_sync_enabled: vars.enabled })
        .eq('id', vars.crmProductId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      qc.invalidateQueries({ queryKey: ['hubspot'] });
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });
}

export function usePushOne(options?: { silent?: boolean }) {
  const qc = useQueryClient();
  const silent = options?.silent === true;
  return useMutation({
    mutationFn: async (crmProductId: string) => {
      const data = await invoke<{ ok: boolean; error?: string }>('push_one', { crm_product_id: crmProductId });
      if (!data.ok) throw new Error(data.error || 'HubSpot push failed');
      return data;
    },
    onSuccess: () => {
      if (!silent) toast.success('Pushed to HubSpot');
      qc.invalidateQueries({ queryKey: ['hubspot', 'links'] });
    },
    onError: (e: Error) => {
      if (!silent) toast.error(`Push failed: ${e.message}`);
    },
  });
}

export function usePushAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<{ success: number; failed: number; errors: string[] }>('push_all'),
    onSuccess: (data) => {
      toast.success(`Pushed ${data.success} product${data.success === 1 ? '' : 's'}` + (data.failed ? ` (${data.failed} failed)` : ''));
      qc.invalidateQueries({ queryKey: ['hubspot', 'links'] });
    },
    onError: (e: Error) => toast.error(`Push failed: ${e.message}`),
  });
}
