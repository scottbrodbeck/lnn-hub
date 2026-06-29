import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the set of distinct owner_user_id values present on deals in the
 * given pipeline (plus a flag for unassigned). Used to scope owner pickers so
 * users only see filters that would actually return results.
 *
 * Counts open + won + lost together — the pipeline owner list shouldn't
 * disappear when the user toggles status tabs.
 */
export function usePipelineDealOwners(pipelineId: string | undefined) {
  return useQuery({
    enabled: !!pipelineId,
    queryKey: ['crm', 'pipeline-deal-owners', pipelineId],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<{ ownerIds: Set<string>; hasUnassigned: boolean }> => {
      const { data, error } = await supabase
        .from('crm_deals')
        .select('owner_user_id')
        .eq('pipeline_id', pipelineId!)
        .range(0, 49999);
      if (error) throw error;
      const ownerIds = new Set<string>();
      let hasUnassigned = false;
      for (const r of data ?? []) {
        if (r.owner_user_id) ownerIds.add(r.owner_user_id as string);
        else hasUnassigned = true;
      }
      return { ownerIds, hasUnassigned };
    },
  });
}
