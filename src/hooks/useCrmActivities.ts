import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueOutbox } from './useOutboxEnqueue';
import { mapNoteToHs, mapTaskToHs } from '@/lib/hubspotMappers';
import { fetchAllRows } from '@/lib/supabasePaginate';

export type CrmActivityType = 'call' | 'meeting' | 'task' | 'email' | 'note';

export type CrmActivity = {
  id: string;
  type: CrmActivityType;
  subject: string;
  body: string | null;
  due_at: string | null;
  completed_at: string | null;
  owner_user_id: string | null;
  deal_id: string | null;
  crm_organization_id: string | null;
  contact_id: string | null;
  created_at: string;
  updated_at: string;
  // HubSpot engagement fields (nullable for local-only activities)
  engagement_type: string | null;
  direction: string | null;
  body_html: string | null;
  body_text: string | null;
  body_fetched_at: string | null;
  metadata: any;
  hs_timestamp: string | null;
  hs_updated_at: string | null;
  hubspot_id: string | null;
  sync_status: string | null;
  sync_error: string | null;
};

export type CrmActivityRow = CrmActivity & {
  owner_name: string | null;
  deal_title: string | null;
  organization_name: string | null;
  contact_name: string | null;
};

export type ActivitiesFilters = {
  type?: CrmActivityType;
  ownerId?: string;
  dealId?: string;
  organizationId?: string;
  contactId?: string;
  scope?: 'overdue' | 'today' | 'upcoming' | 'completed' | 'all';
};

const SELECT = `*,
  owner:profiles!crm_activities_owner_user_id_fkey(id,full_name,email),
  deal:crm_deals(id,title),
  organization:crm_organizations(id,name),
  contact:crm_contacts(id,first_name,last_name)`;

function mapRow(r: any): CrmActivityRow {
  return {
    ...r,
    owner_name: r.owner?.full_name ?? r.owner?.email ?? null,
    deal_title: r.deal?.title ?? null,
    organization_name: r.organization?.name ?? null,
    contact_name: r.contact
      ? `${r.contact.first_name ?? ''} ${r.contact.last_name ?? ''}`.trim() || null
      : null,
  };
}

export function useCrmActivities(filters: ActivitiesFilters = {}) {
  return useQuery({
    queryKey: ['crm', 'activities', filters],
    queryFn: async (): Promise<CrmActivityRow[]> => {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

      // Page through all matching rows — a bare .select() silently truncates the list
      // at PostgREST's 1000-row cap. Secondary .order('id') makes paging deterministic
      // (due_at has ties and nulls).
      const rows = await fetchAllRows((fromRow, toRow) => {
        let q = supabase
          .from('crm_activities')
          .select(SELECT)
          .order('due_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true });
        if (filters.type) q = q.eq('type', filters.type as any);
        if (filters.ownerId) q = q.eq('owner_user_id', filters.ownerId);
        if (filters.dealId) q = q.eq('deal_id', filters.dealId);
        if (filters.organizationId) q = q.eq('crm_organization_id', filters.organizationId);
        if (filters.contactId) q = q.eq('contact_id', filters.contactId);

        switch (filters.scope) {
          case 'overdue':
            q = q.is('completed_at', null).lt('due_at', startOfToday);
            break;
          case 'today':
            q = q.is('completed_at', null).gte('due_at', startOfToday).lt('due_at', startOfTomorrow);
            break;
          case 'upcoming':
            q = q.is('completed_at', null).gte('due_at', startOfTomorrow);
            break;
          case 'completed': {
            const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            q = q.not('completed_at', 'is', null).gte('completed_at', since);
            break;
          }
        }
        return q.range(fromRow, toRow);
      });
      return rows.map(mapRow);
    },
  });
}

export function useCreateCrmActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CrmActivity>) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('crm_activities')
        .insert({
          type: (input.type ?? 'task') as any,
          subject: input.subject!,
          body: input.body ?? null,
          due_at: input.due_at ?? null,
          owner_user_id: input.owner_user_id ?? u.user?.id ?? null,
          deal_id: input.deal_id ?? null,
          crm_organization_id: input.crm_organization_id ?? null,
          contact_id: input.contact_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // Only notes and tasks push out; emails/calls/meetings are inbound-only.
      if (data.type === 'note' || data.type === 'task') {
        await enqueueOutbox({
          entity_type: data.type as 'note' | 'task',
          entity_id: data.id,
          op: 'create',
          payload: { properties: data.type === 'note' ? mapNoteToHs(data) : mapTaskToHs(data) },
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'activities'] });
      toast.success('Activity logged');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCrmActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmActivity> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_activities')
        .update(patch as any)
        .eq('id', id)
        .select('*, hubspot_id, type')
        .single();
      if (error) throw error;

      if ((data as any).hubspot_id && (data.type === 'note' || data.type === 'task')) {
        await enqueueOutbox({
          entity_type: data.type as 'note' | 'task',
          entity_id: id,
          hubspot_id: (data as any).hubspot_id,
          op: 'update',
          payload: { properties: data.type === 'note' ? mapNoteToHs(data) : mapTaskToHs(data) },
        });
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'activities'] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useToggleActivityComplete() {
  const update = useUpdateCrmActivity();
  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) =>
      update.mutateAsync({ id, completed_at: completed ? new Date().toISOString() : null } as any),
  });
}

export function useDeleteCrmActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Per policy: deletes are local-only. HubSpot engagement remains and must be
      // archived by a user in HubSpot if desired.
      const { error } = await supabase.from('crm_activities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'activities'] });
      toast.success('Activity removed from workspace. To delete in HubSpot, do so there directly.');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
