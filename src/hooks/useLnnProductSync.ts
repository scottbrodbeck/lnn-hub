import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ProductSyncRun = {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  created_count: number;
  updated_count: number;
  archived_count: number;
  unchanged_count: number;
  status: string;
  error: string | null;
  triggered_by: string;
};

export function useProductSyncRuns(limit = 20) {
  return useQuery({
    queryKey: ['crm', 'product-sync-runs', limit],
    queryFn: async (): Promise<ProductSyncRun[]> => {
      const { data, error } = await supabase
        .from('crm_product_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ProductSyncRun[];
    },
  });
}

export function useLatestProductSyncRun() {
  return useQuery({
    queryKey: ['crm', 'product-sync-runs', 'latest'],
    queryFn: async (): Promise<ProductSyncRun | null> => {
      const { data, error } = await supabase
        .from('crm_product_sync_runs')
        .select('*')
        .eq('status', 'success')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProductSyncRun | null;
    },
  });
}

export function useTriggerProductSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-products-from-lnn', {
        body: {},
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        run_id: string;
        created: number;
        updated: number;
        unchanged: number;
        archived: number;
      };
    },
    onSuccess: (data) => {
      toast.success(
        `Sync complete — ${data.created} created, ${data.updated} updated, ${data.archived} archived`,
      );
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      qc.invalidateQueries({ queryKey: ['crm', 'product-sync-runs'] });
    },
    onError: (e: any) => toast.error(`Sync failed: ${e.message}`),
  });
}
