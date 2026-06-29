import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

async function call<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('qbo-invoice', { body });
  if (error) throw new Error(error.message);
  if (!(data as any)?.ok) throw new Error((data as any)?.error ?? 'Call failed');
  return (data as any).result as T;
}

export type AssignmentLinePlan = {
  deal_product_id: string;
  line_key: string;
  product_id: string;
  product_name: string;
  product_category: string | null;
  product_site_slug: string | null;
  count: number;
  site_id: string | null;
  site_name: string | null;
  post_type: string;
  content_category: string;
  stagger: 'none' | 'weekly' | 'biweekly';
  assignment_kind: 'post' | 'display_ad' | 'unknown';
  skip: boolean;
  blockers: string[];
  parent_deal_product_id?: string | null;
  bundle_label?: string | null;
};

export type AssignmentSourceRef = {
  qboInvoicesId?: string | null;
  dealId?: string | null;
};

export type AssignmentPlan = {
  source: 'invoice' | 'deal';
  invoice: {
    id: string | null; // null when planning straight from deal products
    deal_id: string;
    invoice_type: 'one_time' | 'recurring';
    recurrence_cadence: string | null;
    recurrence_start_date: string | null;
    recurrence_end_date: string | null;
    txn_date: string | null;
    organization_id: string;
    organization_name: string;
    organization_linked_org_id: string | null;
    organization_linked_org_name: string | null;
    organization_linked_org_client_code: string | null;

  };
  deal: { id: string; title: string };
  defaults: {
    default_months_for_recurring: number;
    max_months_for_recurring: number;
    default_stagger: 'none' | 'weekly' | 'biweekly';
    category_mapping: Record<
      string,
      { post_type: string; content_category: string; assignment_kind: 'post' | 'display_ad' | 'bundle' }
    >;
  };
  sites: Array<{ id: string; name: string }>;
  lines: AssignmentLinePlan[];
  already_created_count: number;
};

export function useAssignmentPlan(source: AssignmentSourceRef, enabled: boolean) {
  const key = source.qboInvoicesId ?? (source.dealId ? `deal:${source.dealId}` : undefined);
  return useQuery({
    queryKey: ['qbo', 'assignment-plan', key],
    enabled: !!key && enabled,
    queryFn: () =>
      call<AssignmentPlan>({
        action: 'plan-assignments',
        ...(source.qboInvoicesId
          ? { qbo_invoices_id: source.qboInvoicesId }
          : { deal_id: source.dealId }),
      }),
  });
}

export function useCreateAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      qbo_invoices_id?: string | null;
      deal_id?: string | null;
      months_to_schedule?: number;
      base_date?: string;
      unscheduled?: boolean;
      lines: Array<{
        deal_product_id: string;
        product_id: string;
        product_name: string;
        count: number;
        site_id: string;
        post_type: string;
        content_category: string;
        stagger: 'none' | 'weekly' | 'biweekly';
        skip?: boolean;
        bundle_label?: string | null;
      }>;
    }) => call<{ created: number; skipped: number; cycles: number; assignment_ids: string[] }>({
      action: 'create-assignments', ...input,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['qbo', 'assignment-plan'] });
      qc.invalidateQueries({ queryKey: ['qbo', 'invoices'] });
      qc.invalidateQueries({ queryKey: ['post_assignments'] });
      const skippedNote = r.skipped ? ` (${r.skipped} already existed)` : '';
      toast.success(`${r.created} assignment${r.created === 1 ? '' : 's'} created${skippedNote}`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}
