import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CrmLookupKey = 'deal_sources' | 'lost_reasons';

export function useCrmLookup(key: CrmLookupKey) {
  return useQuery({
    queryKey: ['crm', 'settings', key],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('crm_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value as any) ?? [];
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    },
  });
}

export function useUpdateCrmLookup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: CrmLookupKey; value: string[] }) => {
      const { error } = await supabase
        .from('crm_settings')
        .upsert({ key, value: value as any, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'settings', vars.key] });
      toast.success('Saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
