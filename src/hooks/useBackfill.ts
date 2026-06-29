import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BackfillStatus = Record<string, {
  table: string | null;
  row_count: number;
  watermark: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_error: string | null;
  records_processed: number;
}>;

export function useBackfillStatus() {
  return useQuery({
    queryKey: ['crm', 'backfill', 'status'],
    refetchInterval: 5_000,
    queryFn: async (): Promise<BackfillStatus> => {
      const { data, error } = await supabase.functions.invoke('crm-hubspot-backfill', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return (data as any)?.status ?? {};
    },
  });
}

export function useBackfillStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { objects?: string[]; expected_count: number }) => {
      const { data, error } = await supabase.functions.invoke('crm-hubspot-backfill', {
        body: {
          action: 'start',
          objects: input?.objects,
          confirm: true,
          expected_count: input?.expected_count ?? 0,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'backfill'] });
      qc.invalidateQueries({ queryKey: ['crm', 'sync_state'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useBackfillReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (objects?: string[]) => {
      const { data, error } = await supabase.functions.invoke('crm-hubspot-backfill', {
        body: { action: 'reset', objects },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Watermarks cleared — next run will backfill from the beginning');
      qc.invalidateQueries({ queryKey: ['crm', 'backfill'] });
      qc.invalidateQueries({ queryKey: ['crm', 'sync_state'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCleanupBodies() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-hubspot-cleanup-bodies', { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => toast.success(`Cleared ${d?.cleared ?? 0} cold message bodies`),
    onError: (e: any) => toast.error(e.message),
  });
}
