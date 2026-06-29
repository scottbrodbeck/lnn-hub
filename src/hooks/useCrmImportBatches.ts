import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CrmImportBatch = {
  id: string;
  source: string;
  status: string;
  counts: any;
  selected_entities: any;
  pipeline_id: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  undone_at: string | null;
};

export function useCrmImportBatches() {
  return useQuery({
    queryKey: ['crm', 'import-batches'],
    queryFn: async (): Promise<CrmImportBatch[]> => {
      const { data, error } = await supabase
        .from('crm_import_batches' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useCrmImportStaging(batchId: string | null) {
  return useQuery({
    enabled: !!batchId,
    queryKey: ['crm', 'import-staging', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_import_staging' as any)
        .select('*')
        .eq('batch_id', batchId!)
        .limit(2000);
      if (error) throw error;
      return data as any[];
    },
  });
}
