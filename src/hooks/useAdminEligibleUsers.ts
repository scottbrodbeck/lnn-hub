import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AdminEligibleUser = {
  id: string;
  full_name: string | null;
  email: string;
};

/**
 * Lists users with role 'admin' or 'super_admin'.
 * Used by the Sales Rep picker on admin clients.
 */
export function useAdminEligibleUsers() {
  return useQuery({
    queryKey: ['admin', 'eligible-users'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AdminEligibleUser[]> => {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['admin', 'super_admin'] as any);
      if (error) throw error;
      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids)
        .order('full_name', { ascending: true });
      if (pErr) throw pErr;
      return (profs ?? []) as AdminEligibleUser[];
    },
  });
}

/**
 * Set of lowercased emails belonging to admin/super_admin users.
 * Used to highlight HubSpot owners that correspond to a local admin user.
 */
export function useAdminEmailSet() {
  const query = useAdminEligibleUsers();
  const emails = new Set<string>(
    (query.data ?? [])
      .map((u) => (u.email || '').toLowerCase())
      .filter(Boolean),
  );
  return { ...query, emails };
}
