import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns true if the current user owns at least one open deal in the given pipeline.
 * Used to auto-default the pipeline owner filter to "my deals".
 */
export function useCurrentUserHasOpenDeals(pipelineId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crm', 'has-open-deals', pipelineId, user?.id],
    enabled: !!pipelineId && !!user?.id,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('crm_deals')
        .select('id')
        .eq('pipeline_id', pipelineId!)
        .eq('owner_user_id', user!.id)
        .eq('status', 'open')
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}
