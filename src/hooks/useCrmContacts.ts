import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueOutbox } from './useOutboxEnqueue';
import { mapContactToHs } from '@/lib/hubspotMappers';

export type CrmContact = {
  id: string;
  crm_organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmContactWithOrg = CrmContact & {
  organization_name: string | null;
  owner_name: string | null;
};

export function useCrmContacts(opts?: { search?: string; organizationId?: string; ownerId?: string }) {
  return useQuery({
    queryKey: ['crm', 'contacts', opts?.search ?? '', opts?.organizationId ?? '', opts?.ownerId ?? ''],
    queryFn: async (): Promise<CrmContactWithOrg[]> => {
      let q = supabase
        .from('crm_contacts')
        .select(
          `*,
          organization:crm_organizations(id,name),
          owner:profiles!crm_contacts_owner_user_id_fkey(id,full_name,email)`
        )
        .order('updated_at', { ascending: false });

      if (opts?.organizationId) q = q.eq('crm_organization_id', opts.organizationId);
      if (opts?.ownerId === 'unassigned') q = q.is('owner_user_id', null);
      else if (opts?.ownerId) q = q.eq('owner_user_id', opts.ownerId);
      if (opts?.search?.trim()) {
        q = q.or(
          `first_name.ilike.%${opts.search}%,last_name.ilike.%${opts.search}%,email.ilike.%${opts.search}%,phone.ilike.%${opts.search}%`
        );
      }
      const { data, error } = await q.range(0, 49999);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        organization_name: r.organization?.name ?? null,
        owner_name: r.owner?.full_name ?? r.owner?.email ?? null,
      }));
    },
  });
}

export type ContactsPagedParams = {
  page: number;
  pageSize: number;
  search?: string;
  organizationId?: string;
  ownerId?: string;
  sortKey?: 'first_name' | 'last_name' | 'title' | 'email' | 'phone' | 'is_primary' | 'updated_at';
  sortDir?: 'asc' | 'desc';
};

export type CrmContactsPagedResult = { rows: CrmContactWithOrg[]; total: number };

export function useCrmContactsPaged(params: ContactsPagedParams) {
  const { page, pageSize, search, organizationId, ownerId, sortKey = 'updated_at', sortDir = 'desc' } = params;
  return useQuery({
    queryKey: ['crm', 'contacts', 'paged', { page, pageSize, search: search ?? '', organizationId: organizationId ?? '', ownerId: ownerId ?? '', sortKey, sortDir }],
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<CrmContactsPagedResult> => {
      let q = supabase
        .from('crm_contacts')
        .select(
          `*,
          organization:crm_organizations(id,name),
          owner:profiles!crm_contacts_owner_user_id_fkey(id,full_name,email)`,
          { count: 'exact' }
        )
        .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false });

      if (organizationId) q = q.eq('crm_organization_id', organizationId);
      if (ownerId === 'unassigned') q = q.is('owner_user_id', null);
      else if (ownerId) q = q.eq('owner_user_id', ownerId);
      if (search?.trim()) {
        q = q.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
        );
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({
        ...r,
        organization_name: r.organization?.name ?? null,
        owner_name: r.owner?.full_name ?? r.owner?.email ?? null,
      }));
      return { rows, total: count ?? rows.length };
    },
  });
}

export function useCreateCrmContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CrmContact>) => {
      const { data: u } = await supabase.auth.getUser();
      if (input.is_primary && input.crm_organization_id) {
        const { error: demoteError } = await supabase
          .from('crm_contacts')
          .update({ is_primary: false })
          .eq('crm_organization_id', input.crm_organization_id);
        if (demoteError) throw demoteError; // don't create a 2nd primary if demotion failed
      }
      const { data, error } = await supabase
        .from('crm_contacts')
        .insert({
          crm_organization_id: input.crm_organization_id ?? null,
          first_name: input.first_name ?? null,
          last_name: input.last_name ?? null,
          title: input.title ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          is_primary: !!input.is_primary,
          notes: input.notes ?? null,
          owner_user_id: input.owner_user_id ?? u.user?.id ?? null,
        })
        .select('*, organization:crm_organizations(hubspot_id)')
        .single();
      if (error) throw error;

      // Enqueue HubSpot create with optional company association.
      const companyHsId = (data as any).organization?.hubspot_id ?? null;
      const associations = companyHsId
        ? [{ to: { id: companyHsId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 279 }] }]
        : undefined;
      await enqueueOutbox({
        entity_type: 'contact',
        entity_id: data.id,
        op: 'create',
        payload: { properties: mapContactToHs(data), associations },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      toast.success('Contact created');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCrmContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmContact> & { id: string }) => {
      if (patch.is_primary && patch.crm_organization_id) {
        const { error: demoteError } = await supabase
          .from('crm_contacts')
          .update({ is_primary: false })
          .eq('crm_organization_id', patch.crm_organization_id)
          .neq('id', id);
        if (demoteError) throw demoteError; // don't leave two primary contacts if demotion failed
      }
      const { data, error } = await supabase
        .from('crm_contacts')
        .update(patch)
        .eq('id', id)
        .select('*, hubspot_id')
        .single();
      if (error) throw error;

      if ((data as any).hubspot_id) {
        await enqueueOutbox({
          entity_type: 'contact',
          entity_id: id,
          hubspot_id: (data as any).hubspot_id,
          op: 'update',
          payload: { properties: mapContactToHs(data) },
        });
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'contacts'] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteCrmContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Per policy: deletes are local-only. The HubSpot record is left intact —
      // users must archive it in HubSpot directly.
      const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'contacts'] });
      toast.success('Contact removed from workspace. To archive in HubSpot, do so there directly.');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
