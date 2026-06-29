import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useEngagementBody(activityId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['crm', 'engagement_body', activityId],
    enabled: !!activityId && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-hubspot-engagement-body', {
        body: { activity_id: activityId },
      });
      if (error) throw error;
      return data as { body_html: string | null; body_text: string | null; metadata: any };
    },
  });
}
