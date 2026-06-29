import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CrmPipeline = {
  id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
};

export type CrmStage = {
  id: string;
  pipeline_id: string;
  name: string;
  sort_order: number;
  win_probability: number;
  is_won: boolean;
  is_lost: boolean;
  color: string | null;
};

export function useCrmPipelines() {
  return useQuery({
    queryKey: ['crm', 'pipelines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_pipelines')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmPipeline[];
    },
  });
}

export function useCrmStages(pipelineId?: string) {
  return useQuery({
    queryKey: ['crm', 'stages', pipelineId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('crm_pipeline_stages').select('*').order('sort_order', { ascending: true });
      if (pipelineId) q = q.eq('pipeline_id', pipelineId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CrmStage[];
    },
  });
}

export function useDefaultPipeline() {
  const { data: pipelines, ...rest } = useCrmPipelines();
  const defaultPipeline =
    pipelines?.find((p) => p.is_default) ?? pipelines?.[0] ?? null;
  return { defaultPipeline, pipelines, ...rest };
}
