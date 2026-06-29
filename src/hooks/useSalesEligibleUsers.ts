import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SalesEligibleUser = {
  id: string;
  full_name: string | null;
  email: string;
};

/**
 * Lists users with sales-relevant roles (sales, admin, super_admin).
 * Used by owner pickers across CRM forms.
 */
export function useSalesEligibleUsers() {
  return useQuery({
    queryKey: ['crm', 'eligible-users'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SalesEligibleUser[]> => {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['sales', 'admin', 'super_admin'] as any);
      if (error) throw error;
      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      if (pErr) throw pErr;
      return (profs ?? []) as SalesEligibleUser[];
    },
  });
}
