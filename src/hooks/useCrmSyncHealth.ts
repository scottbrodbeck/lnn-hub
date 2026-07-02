import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CrmSyncState = {
  object_type: string;
  last_modified_watermark: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  last_error: string | null;
  records_processed: number | null;
  last_full_reconcile_at: string | null;
  updated_at: string;
};

export function useCrmSyncState() {
  return useQuery({
    queryKey: ['crm', 'sync_state'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<CrmSyncState[]> => {
      const { data, error } = await supabase
        .from('crm_sync_state')
        .select('*')
        .order('object_type');
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useCrmOutboxStats() {
  return useQuery({
    queryKey: ['crm', 'outbox_stats'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_sync_outbox')
        .select('status')
        .in('status', ['pending', 'in_flight', 'error', 'failed']);
      if (error) throw error;
      const counts: Record<string, number> = { pending: 0, in_flight: 0, error: 0, failed: 0 };
      for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
      return counts;
    },
  });
}

export function useCrmSyncLog(limit = 25) {
  return useQuery({
    queryKey: ['crm', 'sync_log', limit],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_sync_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTriggerSyncTick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-hubspot-sync-tick', { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error); // function returns 200 + {error} on token/rate failures
      return data;
    },
    onSuccess: () => {
      toast.success('Sync triggered');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['crm', 'sync_state'] });
        qc.invalidateQueries({ queryKey: ['crm', 'sync_log'] });
        qc.invalidateQueries({ queryKey: ['crm', 'outbox_stats'] });
      }, 2000);
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useTriggerPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-hubspot-push', { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error); // function returns 200 + {error} on token/rate failures
      return data;
    },
    onSuccess: () => {
      toast.success('Push worker triggered');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['crm', 'outbox_stats'] }), 2000);
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// --- Sync pause toggle (also flipped automatically by the circuit breaker) ---

export function useSyncPaused() {
  return useQuery({
    queryKey: ['crm', 'sync_paused'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_settings')
        .select('value, updated_at')
        .eq('key', 'sync_paused')
        .maybeSingle();
      const v = (data as any)?.value;
      const paused = v === true || v === 'true';
      return { paused, updated_at: (data as any)?.updated_at ?? null };
    },
  });
}

export function useSetSyncPaused() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paused: boolean) => {
      const { error } = await supabase
        .from('crm_settings')
        .upsert(
          { key: 'sync_paused', value: paused as any, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
      if (error) throw error;
    },
    onSuccess: (_d, paused) => {
      qc.invalidateQueries({ queryKey: ['crm', 'sync_paused'] });
      toast.success(paused ? 'HubSpot sync paused' : 'HubSpot sync resumed');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

