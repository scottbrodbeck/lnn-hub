import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueOutbox, getPipelineHubspotId, getStageHubspotId, getOwnerHubspotId } from './useOutboxEnqueue';
import { mapDealToHs } from '@/lib/hubspotMappers';

export type CrmDealStatus = 'open' | 'won' | 'lost';

export type CrmDeal = {
  id: string;
  title: string;
  crm_organization_id: string | null;
  primary_contact_id: string | null;
  pipeline_id: string;
  stage_id: string;
  owner_user_id: string | null;
  value: number;
  currency: string;
  expected_close_date: string | null;
  status: CrmDealStatus;
  lost_reason: string | null;
  source: string | null;
  notes: string | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmDealRow = CrmDeal & {
  organization_name: string | null;
  contact_name: string | null;
  stage_name: string | null;
  stage_color: string | null;
  owner_name: string | null;
};

export type DealsFilters = {
  search?: string;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  status?: CrmDealStatus | 'all';
  closeFrom?: string;
  closeTo?: string;
};

export function useCrmDeals(filters: DealsFilters = {}) {
  return useQuery({
    queryKey: ['crm', 'deals', filters],
    queryFn: async (): Promise<CrmDealRow[]> => {
      let q = supabase
        .from('crm_deals')
        .select(
          `*,
          organization:crm_organizations(id,name),
          contact:crm_contacts(id,first_name,last_name),
          stage:crm_pipeline_stages(id,name,color),
          owner:profiles!crm_deals_owner_user_id_fkey(id,full_name,email)`
        )
        .order('updated_at', { ascending: false });

      if (filters.pipelineId) q = q.eq('pipeline_id', filters.pipelineId);
      if (filters.stageId) q = q.eq('stage_id', filters.stageId);
      if (filters.ownerId === 'unassigned') q = q.is('owner_user_id', null);
      else if (filters.ownerId) q = q.eq('owner_user_id', filters.ownerId);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.closeFrom) q = q.gte('expected_close_date', filters.closeFrom);
      if (filters.closeTo) q = q.lte('expected_close_date', filters.closeTo);
      if (filters.search?.trim()) q = q.ilike('title', `%${filters.search}%`);

      const { data, error } = await q.range(0, 49999);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        organization_name: r.organization?.name ?? null,
        contact_name: r.contact
          ? `${r.contact.first_name ?? ''} ${r.contact.last_name ?? ''}`.trim() || null
          : null,
        stage_name: r.stage?.name ?? null,
        stage_color: r.stage?.color ?? null,
        owner_name: r.owner?.full_name ?? r.owner?.email ?? null,
      }));
    },
  });
}

export type DealsPagedParams = DealsFilters & {
  page: number;
  pageSize: number;
  sortKey?: 'title' | 'value' | 'expected_close_date' | 'status' | 'updated_at';
  sortDir?: 'asc' | 'desc';
};

export type CrmDealsPagedResult = { rows: CrmDealRow[]; total: number };

export function useCrmDealsPaged(params: DealsPagedParams) {
  const {
    page, pageSize,
    search, pipelineId, stageId, ownerId, status, closeFrom, closeTo,
    sortKey = 'updated_at', sortDir = 'desc',
  } = params;
  return useQuery({
    queryKey: ['crm', 'deals', 'paged', { page, pageSize, search: search ?? '', pipelineId: pipelineId ?? '', stageId: stageId ?? '', ownerId: ownerId ?? '', status: status ?? '', closeFrom: closeFrom ?? '', closeTo: closeTo ?? '', sortKey, sortDir }],
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<CrmDealsPagedResult> => {
      let q = supabase
        .from('crm_deals')
        .select(
          `*,
          organization:crm_organizations(id,name),
          contact:crm_contacts(id,first_name,last_name),
          stage:crm_pipeline_stages(id,name,color),
          owner:profiles!crm_deals_owner_user_id_fkey(id,full_name,email)`,
          { count: 'exact' }
        )
        .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false });

      if (pipelineId) q = q.eq('pipeline_id', pipelineId);
      if (stageId) q = q.eq('stage_id', stageId);
      if (ownerId === 'unassigned') q = q.is('owner_user_id', null);
      else if (ownerId) q = q.eq('owner_user_id', ownerId);
      if (status && status !== 'all') q = q.eq('status', status);
      if (closeFrom) q = q.gte('expected_close_date', closeFrom);
      if (closeTo) q = q.lte('expected_close_date', closeTo);
      if (search?.trim()) q = q.ilike('title', `%${search}%`);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      const rows: CrmDealRow[] = (data ?? []).map((r: any) => ({
        ...r,
        organization_name: r.organization?.name ?? null,
        contact_name: r.contact
          ? `${r.contact.first_name ?? ''} ${r.contact.last_name ?? ''}`.trim() || null
          : null,
        stage_name: r.stage?.name ?? null,
        stage_color: r.stage?.color ?? null,
        owner_name: r.owner?.full_name ?? r.owner?.email ?? null,
      }));
      return { rows, total: count ?? rows.length };
    },
  });
}

export function useCrmDeal(id?: string) {
  return useQuery({
    queryKey: ['crm', 'deal', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_deals')
        .select(
          `*,
          organization:crm_organizations(id,name),
          contact:crm_contacts(id,first_name,last_name,email),
          stage:crm_pipeline_stages(id,name,color,is_won,is_lost),
          owner:profiles!crm_deals_owner_user_id_fkey(id,full_name,email)`
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCrmDealStageHistory(dealId?: string) {
  return useQuery({
    queryKey: ['crm', 'deal', dealId, 'history'],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_deal_stage_history')
        .select(
          `*,
          from_stage:crm_pipeline_stages!crm_deal_stage_history_from_stage_id_fkey(name),
          to_stage:crm_pipeline_stages!crm_deal_stage_history_to_stage_id_fkey(name),
          changed_by_profile:profiles!crm_deal_stage_history_changed_by_fkey(full_name,email)`
        )
        .eq('deal_id', dealId!)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCrmDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CrmDeal>) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('crm_deals')
        .insert({
          title: input.title!,
          pipeline_id: input.pipeline_id!,
          stage_id: input.stage_id!,
          crm_organization_id: input.crm_organization_id ?? null,
          primary_contact_id: input.primary_contact_id ?? null,
          owner_user_id: input.owner_user_id ?? u.user?.id ?? null,
          value: input.value ?? 0,
          currency: input.currency ?? 'USD',
          expected_close_date: input.expected_close_date ?? null,
          source: input.source ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // Enqueue create to HubSpot
      const [stageHs, pipelineHs, ownerHs] = await Promise.all([
        getStageHubspotId(data.stage_id),
        getPipelineHubspotId(data.pipeline_id),
        getOwnerHubspotId(data.owner_user_id),
      ]);
      if (data.owner_user_id && !ownerHs) {
        toast.warning(
          "Selected owner isn't mapped to a HubSpot user yet — saved locally, but HubSpot will keep its current owner. Update owner mapping in CRM settings.",
        );
      }
      await enqueueOutbox({
        entity_type: 'deal',
        entity_id: data.id,
        op: 'create',
        payload: {
          properties: mapDealToHs(data, {
            stageHubspotId: stageHs,
            pipelineHubspotId: pipelineHs,
            ownerHubspotId: ownerHs,
            includeOwner: true,
          }),
        },
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'deals'] });
      toast.success('Deal created');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCrmDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmDeal> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_deals')
        .update(patch)
        .eq('id', id)
        .select('*, hubspot_id')
        .single();
      if (error) throw error;

      // Fire-and-forget HubSpot outbox enqueue so the UI isn't blocked on it.
      if ((data as any).hubspot_id) {
        const ownerChanged = 'owner_user_id' in patch;
        (async () => {
          try {
            const [stageHs, pipelineHs, ownerHs] = await Promise.all([
              'stage_id' in patch ? getStageHubspotId(data.stage_id) : Promise.resolve(null),
              'pipeline_id' in patch ? getPipelineHubspotId(data.pipeline_id) : Promise.resolve(null),
              ownerChanged ? getOwnerHubspotId((data as any).owner_user_id) : Promise.resolve(null),
            ]);
            if (ownerChanged && (data as any).owner_user_id && !ownerHs) {
              toast.warning(
                "Selected owner isn't mapped to a HubSpot user yet — saved locally, but HubSpot will keep its current owner. Update owner mapping in CRM settings.",
              );
            }
            await enqueueOutbox({
              entity_type: 'deal',
              entity_id: id,
              hubspot_id: (data as any).hubspot_id,
              op: 'update',
              payload: {
                properties: mapDealToHs(data, {
                  stageHubspotId: stageHs,
                  pipelineHubspotId: pipelineHs,
                  ownerHubspotId: ownerHs,
                  // Only push the owner field when it was part of this update.
                  // When mapping is missing for a non-null owner, skip pushing the field
                  // (avoid clearing the HubSpot owner unintentionally).
                  includeOwner: ownerChanged && (!(data as any).owner_user_id || !!ownerHs),
                }),
              },
            });
          } catch (e) {
            console.error('[useUpdateCrmDeal] outbox enqueue failed', e);
          }
        })();
      }
      return data;
    },
    onMutate: async ({ id, ...patch }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ['crm', 'deal', id] }),
        qc.cancelQueries({ queryKey: ['crm', 'deals'] }),
      ]);

      const prevDeal = qc.getQueryData<any>(['crm', 'deal', id]);
      const prevListEntries = qc.getQueriesData<any>({ queryKey: ['crm', 'deals'] });

      // Patch the single-deal cache
      if (prevDeal) {
        qc.setQueryData(['crm', 'deal', id], { ...prevDeal, ...patch });
      }

      // Patch any deals list caches that contain this row
      for (const [key, list] of prevListEntries) {
        if (Array.isArray(list)) {
          qc.setQueryData(
            key,
            list.map((row: any) => (row?.id === id ? { ...row, ...patch } : row))
          );
        }
      }

      return { prevDeal, prevListEntries };
    },
    onError: (e: any, vars, ctx) => {
      // Roll back optimistic updates
      if (ctx?.prevDeal) {
        qc.setQueryData(['crm', 'deal', vars.id], ctx.prevDeal);
      }
      if (ctx?.prevListEntries) {
        for (const [key, list] of ctx.prevListEntries) {
          qc.setQueryData(key, list);
        }
      }
      toast.error(e.message);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'deals'] });
      qc.invalidateQueries({ queryKey: ['crm', 'deal', vars.id] });
    },
  });
}

export function useDeleteCrmDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Per policy: deletes are local-only. HubSpot deal remains intact and must
      // be archived by a user in HubSpot if desired.
      const { error } = await supabase.from('crm_deals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'deals'] });
      toast.success('Deal removed from workspace. To archive in HubSpot, do so there directly.');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useMarkDealWon() {
  const update = useUpdateCrmDeal();
  return useMutation({
    mutationFn: async ({
      id,
      expected_close_date,
      pipeline_id,
      stage_id,
    }: {
      id: string;
      expected_close_date: string;
      pipeline_id?: string | null;
      stage_id?: string | null;
    }) => {
      // Move the deal into the pipeline's closed-won stage. HubSpot derives
      // "won" from dealstage, so without this the win never reaches HubSpot.
      let wonStageId: string | null = null;
      if (pipeline_id) {
        const { data: wonStage } = await supabase
          .from('crm_pipeline_stages')
          .select('id')
          .eq('pipeline_id', pipeline_id)
          .eq('is_won', true)
          .order('sort_order')
          .limit(1)
          .maybeSingle();
        wonStageId = wonStage?.id ?? null;
      }

      const result = await update.mutateAsync({
        id,
        status: 'won',
        won_at: new Date().toISOString(),
        lost_at: null,
        expected_close_date,
        ...(wonStageId && wonStageId !== stage_id ? { stage_id: wonStageId } : {}),
      } as any);

      // Nudge the push worker so HubSpot reflects the win immediately
      // (the outbox insert trigger usually handles this; this is insurance).
      void supabase.functions.invoke('crm-hubspot-push', { body: {} }).catch(() => {});

      return { ...(result as any), wonStageMissing: !!pipeline_id && !wonStageId };
    },
    onSuccess: (data: any) => {
      if (data?.wonStageMissing) {
        toast.warning(
          'Deal marked Won locally, but this pipeline has no closed-won stage — HubSpot will not show it as won. Configure a won stage in the pipeline settings.',
        );
      } else {
        toast.success('Deal marked Won');
      }
    },
  });
}

export function useMarkDealLost() {
  const update = useUpdateCrmDeal();
  return useMutation({
    mutationFn: async ({ id, lost_reason }: { id: string; lost_reason: string }) => {
      return update.mutateAsync({
        id,
        status: 'lost',
        lost_at: new Date().toISOString(),
        won_at: null,
        lost_reason,
      } as any);
    },
    onSuccess: () => toast.success('Deal marked Lost'),
  });
}

export function useReopenDeal() {
  const update = useUpdateCrmDeal();
  return useMutation({
    mutationFn: async (id: string) => {
      return update.mutateAsync({
        id,
        status: 'open',
        won_at: null,
        lost_at: null,
        lost_reason: null,
      } as any);
    },
    onSuccess: () => toast.success('Deal reopened'),
  });
}
