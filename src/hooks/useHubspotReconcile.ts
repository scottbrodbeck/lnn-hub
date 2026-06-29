import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ReconcileEntity = 'contact' | 'company' | 'both';

export type ReconcileMatch = {
  id: string;
  hubspot_id: string;
  label: string;
  email?: string | null;
};

export type ReconcileResult = {
  ok: boolean;
  action: 'scan' | 'reconcile';
  contacts: ReconcileMatch[];
  organizations: ReconcileMatch[];
  totals: {
    archived_in_hubspot: { contacts: number; organizations: number };
    matched_locally: { contacts: number; organizations: number };
    linked_records: { contacts: number; organizations: number };
    truncated: boolean;
  };
  scan_ms: number;
  deleted?: { contacts: number; organizations: number };
  outbox_cleared?: { contacts: number; organizations: number };
  reconcile_ms?: number;
  error?: string;
};

export function useHubspotReconcile() {
  return useMutation({
    mutationFn: async (payload: {
      action: 'scan' | 'reconcile';
      entity?: ReconcileEntity;
      dryRun?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        'hubspot-archive-reconcile',
        { body: payload },
      );
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || 'Reconcile failed');
      return data as ReconcileResult;
    },
  });
}
