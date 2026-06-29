import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function usePreferredPipeline() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profiles', 'preferred_pipeline', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('preferred_crm_pipeline_id')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.preferred_crm_pipeline_id ?? null;
    },
  });
}

export function useSetPreferredPipeline() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (pipelineId: string | null) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_crm_pipeline_id: pipelineId })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles', 'preferred_pipeline'] });
      toast.success('Default pipeline saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
