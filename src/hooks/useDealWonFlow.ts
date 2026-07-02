import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ProvisionedCampaign } from '@/components/sales/DisplayAdsProvisionDialog';

// Run record for the post-won checklist, persisted in crm_deals.metadata.won_flow.
// Step completion is mostly derived from live DB state; this stores the parts
// the DB can't tell us (skips, links returned by create calls, completion stamp).
export type WonFlowMeta = {
  completed_at?: string | null;
  hubspot?: { won_stage_missing?: boolean };
  invoice?: {
    status?: 'done' | 'skipped';
    qbo_invoices_id?: string;
    doc_number?: string | null;
    qbo_url?: string | null;
    invoice_type?: 'one_time' | 'recurring';
  };
  client?: { created?: boolean; client_code?: string | null };
  users?: { status?: 'done' | 'skipped' };
  assignments?: {
    status?: 'done' | 'skipped';
    created?: number;
    unscheduled?: boolean;
  };
  display?: {
    status?: 'done' | 'skipped';
    campaigns?: ProvisionedCampaign[];
  };
};

export function getWonFlow(deal: any): WonFlowMeta {
  return (deal?.metadata?.won_flow ?? {}) as WonFlowMeta;
}

export function useUpdateWonFlow() {
  const qc = useQueryClient();
  // Direct update (not useUpdateCrmDeal) so metadata writes don't enqueue
  // redundant HubSpot outbox pushes.
  return async (deal: any, patch: Partial<WonFlowMeta>) => {
    // Re-read the latest metadata immediately before merging. This is a
    // read-modify-write of the whole JSON column, so using the render-time
    // `deal.metadata` let two quickly-completed steps clobber each other
    // (a completed step silently reverting to pending). Re-fetching first
    // closes almost all of that window without a schema change. (A fully
    // atomic version would be a jsonb_set RPC — deferred with the DB work.)
    const { data: fresh, error: readError } = await supabase
      .from('crm_deals')
      .select('metadata')
      .eq('id', deal.id)
      .single();
    if (readError) {
      console.error('won_flow read failed', readError);
      return;
    }
    const currentMeta = ((fresh?.metadata ?? deal?.metadata) ?? {}) as Record<string, unknown>;
    const merged = {
      ...currentMeta,
      won_flow: { ...((currentMeta.won_flow as object) ?? {}), ...patch },
    };
    const { error } = await supabase
      .from('crm_deals')
      .update({ metadata: merged } as any)
      .eq('id', deal.id);
    if (error) {
      console.error('won_flow update failed', error);
      return;
    }
    qc.invalidateQueries({ queryKey: ['crm', 'deal', deal.id] });
  };
}

/** Whether the deal has any display-ad products (drives the display step's visibility). */
export function useDealHasDisplayProducts(dealId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['crm', 'deal-display-products', dealId],
    enabled: !!dealId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_deal_products')
        .select('id, product:crm_products(category)')
        .eq('deal_id', dealId!);
      if (error) throw error;
      return (data ?? []).some((r: any) => /display/i.test(r.product?.category ?? ''));
    },
  });
}

/** Count of assignments already generated for this deal (via its invoices or directly). */
export function useDealAssignmentLinkCount(
  dealId: string | undefined,
  invoiceIds: string[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['crm', 'deal-assignment-links', dealId, invoiceIds.join(',')],
    enabled: !!dealId && enabled,
    queryFn: async () => {
      const [byDeal, byInvoice] = await Promise.all([
        supabase
          .from('qbo_invoice_assignment_links')
          .select('id', { count: 'exact', head: true })
          .eq('deal_id', dealId!),
        invoiceIds.length > 0
          ? supabase
              .from('qbo_invoice_assignment_links')
              .select('id', { count: 'exact', head: true })
              .in('qbo_invoice_id', invoiceIds)
          : Promise.resolve({ count: 0 } as any),
      ]);
      return (byDeal.count ?? 0) + (byInvoice.count ?? 0);
    },
  });
}

/**
 * Count of portal users attached to the linked admin org. RLS only lets
 * admins read other users' user_organizations rows, so this must be gated to
 * admin/super_admin callers — a sales user would otherwise read a false 0.
 */
export function useOrgPortalUserCount(orgId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['org-portal-user-count', orgId],
    enabled: !!orgId && enabled,
    queryFn: async () => {
      const { count } = await supabase
        .from('user_organizations')
        .select('user_id', { count: 'exact', head: true })
        .eq('organization_id', orgId!);
      return count ?? 0;
    },
  });
}

/** Cached HubSpot portal id (written by crm-hubspot-push) for deep links. */
export function useHubspotPortalId() {
  return useQuery({
    queryKey: ['crm', 'settings', 'hubspot_portal_id'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_settings')
        .select('value')
        .eq('key', 'hubspot_portal_id')
        .maybeSingle();
      return (data?.value as number | string | null) ?? null;
    },
  });
}
