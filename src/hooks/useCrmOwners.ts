import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CrmOwner = {
  id: string;
  hubspot_owner_id: string;
  email: string | null;
  full_name: string | null;
  profile_id: string | null;
  match_method: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  profile?: { id: string; full_name: string | null; email: string | null } | null;
};

export function useCrmOwners() {
  return useQuery({
    queryKey: ['crm', 'owners'],
    queryFn: async (): Promise<CrmOwner[]> => {
      const { data, error } = await supabase
        .from('crm_owners')
        .select('*, profile:profiles!crm_owners_profile_id_fkey(id, full_name, email)')
        .order('archived', { ascending: true })
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useUpdateOwnerMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ownerId, profileId }: { ownerId: string; profileId: string | null }) => {
      const { error } = await supabase
        .from('crm_owners')
        .update({
          profile_id: profileId,
          match_method: profileId ? 'manual' : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ownerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'owners'] });
      toast.success('Owner mapping updated');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
