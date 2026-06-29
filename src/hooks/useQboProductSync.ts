import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ActionBody = Record<string, unknown> & { action: string };

async function callQbo<T = any>(body: ActionBody): Promise<T> {
  const { data, error } = await supabase.functions.invoke('qbo-product-sync', { body });
  if (error) throw new Error(error.message);
  if (!(data as any)?.ok) throw new Error((data as any)?.error ?? 'QBO call failed');
  return (data as any).result as T;
}

export type QboIncomeAccount = { id: string; name: string; subType?: string };

export function useQboIncomeAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ['qbo', 'income-accounts'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: () => callQbo<{ accounts: QboIncomeAccount[] }>({ action: 'list-income-accounts' }).then((r) => r.accounts),
  });
}

export type QboItem = {
  id: string;
  name: string;
  fullyQualifiedName: string | null;
  sku: string | null;
  unitPrice: number;
  type: string | null;
};

export function useQboItems(enabled: boolean) {
  return useQuery({
    queryKey: ['qbo', 'items'],
    enabled,
    staleTime: 60 * 1000,
    queryFn: () =>
      callQbo<{ environment: string; items: QboItem[] }>({ action: 'list-items' }),
  });
}

export type QboStaleLink = {
  id: string;
  name: string;
  qbo_item_id: string;
  qbo_environment: string | null;
};

export function useQboStaleLinks(enabled: boolean) {
  return useQuery({
    queryKey: ['qbo', 'stale-links'],
    enabled,
    queryFn: () =>
      callQbo<{ current_environment: string; cleared: number; items: QboStaleLink[] }>({
        action: 'stale-links',
      }),
  });
}

export function useClearStaleQboLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      callQbo<{ current_environment: string; cleared: number; items: QboStaleLink[] }>({
        action: 'stale-links',
        clear: true,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['qbo'] });
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      toast.success(
        r.cleared > 0
          ? `Cleared ${r.cleared} stale QuickBooks link${r.cleared === 1 ? '' : 's'}`
          : 'No stale links to clear',
      );
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboSettings() {
  return useQuery({
    queryKey: ['qbo', 'settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_settings')
        .select('value')
        .eq('key', 'qbo_settings')
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? {}) as { default_income_account_id?: string; default_income_account_name?: string };
    },
  });
}

export function useUpdateQboSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: Record<string, unknown>) => {
      const { error } = await supabase
        .from('crm_settings')
        .upsert([{ key: 'qbo_settings', value: value as any, updated_at: new Date().toISOString() }], { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qbo', 'settings'] });
      toast.success('QuickBooks settings saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export type QboMatchResult = {
  exact: Array<{ product_id: string; product_name: string; qbo_item_id: string; qbo_name: string; qbo_price: number }>;
  fuzzy: Array<{ product_id: string; product_name: string; suggestions: Array<{ qbo_item_id: string; qbo_name: string; qbo_price: number; score: number }> }>;
  qbo_item_count: number;
};

export function useQboMatchProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callQbo<QboMatchResult>({ action: 'match' }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['qbo', 'sync-runs'] });
      toast.success(`Scanned ${r.qbo_item_count} QBO items: ${r.exact.length} exact + ${r.fuzzy.length} fuzzy match candidates`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboLinkProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { product_id: string; qbo_item_id: string }) =>
      callQbo<{ ok: boolean; qbo_name: string }>({ action: 'link', ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      toast.success('Product linked to QBO');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboUnlinkProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { product_id: string }) => callQbo<{ ok: boolean }>({ action: 'unlink', ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      toast.success('Product unlinked from QBO');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboBackfillNames() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callQbo<{ ok: boolean; updated: number }>({ action: 'backfill-qbo-names' }),
    onSuccess: (r) => {
      if (r.updated > 0) {
        qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      }
    },
  });
}

export function useQboUpdateProducts(options?: { silent?: boolean }) {
  const qc = useQueryClient();
  const silent = options?.silent === true;
  return useMutation({
    mutationFn: (input: { product_ids?: string[] } = {}) =>
      callQbo<{ updated: number; unchanged: number; errors: number; results: any[] }>({ action: 'update', ...input }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      qc.invalidateQueries({ queryKey: ['qbo', 'sync-runs'] });
      if (silent) return;
      if (r.errors === 0) toast.success(`Synced ${r.updated} updated, ${r.unchanged} already in sync`);
      else toast.warning(`Synced ${r.updated}, ${r.errors} error(s)`);
    },
    onError: (e: any) => {
      if (!silent) toast.error(e.message);
    },
  });
}

export function useQboSyncRuns(limit = 20) {
  return useQuery({
    queryKey: ['qbo', 'sync-runs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qbo_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}


// Global QBO sync toggle (mirrors useHubspotGlobalToggle)
export function useQboGlobalToggle() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['qbo', 'global-toggle'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_settings')
        .select('value')
        .eq('key', 'qbo_sync_globally_enabled')
        .maybeSingle();
      if (error) throw error;
      return data?.value === true;
    },
  });
  const mutate = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('crm_settings')
        .upsert({ key: 'qbo_sync_globally_enabled', value: enabled as any });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qbo', 'global-toggle'] }),
    onError: (e: Error) => toast.error(`Failed to update toggle: ${e.message}`),
  });
  return { ...query, setEnabled: mutate.mutate, isUpdating: mutate.isPending };
}

export type QboSyncFields = 'price' | 'price_name' | 'price_name_description';

// Global selector: which fields get pushed to QBO for ALL linked products on
// scheduled/manual update. Stored in crm_settings under `qbo_sync_fields_default`.
export function useQboSyncFieldsGlobal() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['qbo', 'sync-fields-global'],
    queryFn: async (): Promise<QboSyncFields> => {
      const { data, error } = await supabase
        .from('crm_settings')
        .select('value')
        .eq('key', 'qbo_sync_fields_default')
        .maybeSingle();
      if (error) throw error;
      const v = data?.value as unknown;
      if (v === 'price_name' || v === 'price_name_description' || v === 'price') return v;
      return 'price';
    },
  });
  const mutate = useMutation({
    mutationFn: async (fields: QboSyncFields) => {
      const { error } = await supabase
        .from('crm_settings')
        .upsert({ key: 'qbo_sync_fields_default', value: fields as any });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qbo', 'sync-fields-global'] });
      toast.success('QuickBooks sync fields updated');
    },
    onError: (e: any) => toast.error(e.message),
  });
  return { ...query, setFields: mutate.mutate, isUpdating: mutate.isPending };
}
