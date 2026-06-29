import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ActionBody = Record<string, unknown> & { action: string };

async function callQbo<T = any>(body: ActionBody): Promise<T> {
  const { data, error } = await supabase.functions.invoke('qbo-invoice', { body });
  if (error) throw new Error(error.message);
  if (!(data as any)?.ok) throw new Error((data as any)?.error ?? 'QBO call failed');
  return (data as any).result as T;
}

export type InvoicePreview = {
  deal: { id: string; title: string; value: number };
  organization: { id: string; name: string; qbo_customer_id: string | null; qbo_customer_name: string | null };
  primary_contact_email: string | null;
  line_items: Array<{
    deal_product_id: string;
    product_id: string;
    product_name: string;
    qbo_item_id: string | null;
    quantity: number;
    unit_price: number;
    discount_pct: number;
    total: number;
    ready: boolean;
    blocker?: string;
  }>;
  blockers: string[];
  totals: { subtotal: number; total: number };
};

export function useQboInvoicePreview(dealId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['qbo', 'invoice-preview', dealId],
    enabled: !!dealId && enabled,
    queryFn: () => callQbo<InvoicePreview>({ action: 'preview', deal_id: dealId }),
  });
}

export function useQboCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      deal_id: string;
      txn_date?: string;
      due_date?: string;
      send_email?: boolean;
      send_to?: string;
      customer_memo?: string;
    }) => callQbo<{ qbo_invoices_id: string; qbo_invoice_id: string; doc_number: string | null; email_sent: boolean; email_error?: string | null }>({
      action: 'create', ...input,
    }),
    onSuccess: (r, vars) => {
      qc.invalidateQueries({ queryKey: ['qbo', 'invoices'] });
      qc.invalidateQueries({ queryKey: ['crm', 'deal', vars.deal_id] });
      const label = r.doc_number ?? r.qbo_invoice_id;
      if (r.email_sent) {
        toast.success(`Invoice ${label} created and emailed`);
      } else if (vars.send_email) {
        toast.warning(
          `Invoice ${label} created, but email send failed${r.email_error ? `: ${r.email_error}` : ''}. You can resend from the invoice details.`,
          { duration: 10000 },
        );
      } else {
        toast.success(`Invoice ${label} created in QuickBooks`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useQboCreateRecurringInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      deal_id: string;
      cadence: 'monthly' | 'quarterly' | 'yearly';
      start_date: string;
      end_date?: string | null;
      customer_memo?: string;
    }) => callQbo({ action: 'create-recurring', ...input }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['qbo', 'invoices'] });
      qc.invalidateQueries({ queryKey: ['crm', 'deal', vars.deal_id] });
      toast.success('Recurring invoice scheduled in QuickBooks');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDealInvoices(dealId: string | undefined) {
  return useQuery({
    queryKey: ['qbo', 'invoices', 'by-deal', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qbo_invoices')
        .select('*')
        .eq('deal_id', dealId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useQboRefreshInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string }) => callQbo({ action: 'refresh', ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qbo', 'invoices'] });
      toast.success('Invoice status refreshed');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
