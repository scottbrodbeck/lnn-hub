import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabasePaginate';
import type { CrmDealRow } from './useCrmDeals';
import type { CrmActivityRow } from './useCrmActivities';

export type ReportsFilters = {
  pipelineId?: string;
  ownerIds?: string[]; // empty = all
  from: string; // ISO date
  to: string; // ISO date
};

// Reports aggregate EVERY row, so a silent 1000-row PostgREST cap would understate
// totals/revenue/win-rates with no error shown. fetchAllRows pages through all matching
// rows; a stable .order('id') keeps paging consistent.
export function useCrmReports(filters: ReportsFilters) {
  return useQuery({
    queryKey: ['crm', 'reports', filters],
    queryFn: async () => {
      // Deals: filtered by pipeline + owners. We pull all statuses; aggregator filters by date.
      const dealRows = await fetchAllRows((fromRow, toRow) => {
        let dq = supabase
          .from('crm_deals')
          .select(
            `*,
            organization:crm_organizations(id,name),
            stage:crm_pipeline_stages(id,name,color),
            owner:profiles!crm_deals_owner_user_id_fkey(id,full_name,email)`
          )
          .order('id', { ascending: true });
        if (filters.pipelineId) dq = dq.eq('pipeline_id', filters.pipelineId);
        if (filters.ownerIds && filters.ownerIds.length > 0)
          dq = dq.in('owner_user_id', filters.ownerIds);
        return dq.range(fromRow, toRow);
      });
      const deals: CrmDealRow[] = dealRows.map((r: any) => ({
        ...r,
        organization_name: r.organization?.name ?? null,
        contact_name: null,
        stage_name: r.stage?.name ?? null,
        stage_color: r.stage?.color ?? null,
        owner_name: r.owner?.full_name ?? r.owner?.email ?? null,
      }));

      // Activities: range-bounded by created_at to keep payload small
      const actRows = await fetchAllRows((fromRow, toRow) => {
        let aq = supabase
          .from('crm_activities')
          .select(
            `*,
            owner:profiles!crm_activities_owner_user_id_fkey(id,full_name,email),
            deal:crm_deals(id,title),
            organization:crm_organizations(id,name),
            contact:crm_contacts(id,first_name,last_name)`
          )
          .gte('created_at', filters.from)
          .lte('created_at', filters.to)
          .order('id', { ascending: true });
        if (filters.ownerIds && filters.ownerIds.length > 0)
          aq = aq.in('owner_user_id', filters.ownerIds);
        return aq.range(fromRow, toRow);
      });
      const activities: CrmActivityRow[] = actRows.map((r: any) => ({
        ...r,
        owner_name: r.owner?.full_name ?? r.owner?.email ?? null,
        deal_title: r.deal?.title ?? null,
        organization_name: r.organization?.name ?? null,
        contact_name: r.contact
          ? `${r.contact.first_name ?? ''} ${r.contact.last_name ?? ''}`.trim() || null
          : null,
      }));

      return { deals, activities };
    },
  });
}
