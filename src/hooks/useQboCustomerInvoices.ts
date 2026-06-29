import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type QboInvoiceStatus = 'paid' | 'partially_paid' | 'overdue' | 'open';

export type QboInvoiceListItem = {
  id: string;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  total: number;
  balance: number;
  currency: string | null;
  status: QboInvoiceStatus;
  qbo_url: string;
};

export type QboInvoiceListResponse = {
  invoices: QboInvoiceListItem[];
  customer_qbo_url: string;
};

export type QboInvoiceDetail = {
  id: string;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  currency: string | null;
  customer: { id: string | null; name: string | null; email: string | null };
  line_items: Array<{
    description: string | null;
    qty: number;
    unit_price: number;
    discount_amount: number;
    amount: number;
  }>;
  totals: {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    total: number;
    balance: number;
    amount_paid: number;
  };
  status: QboInvoiceStatus;
  payments: Array<{ id: string; date: string | null; amount: number; method: string | null; ref: string | null }>;
  memo: string | null;
  private_note: string | null;
  qbo_url: string;
  voided?: boolean;
};

async function callQbo<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('qbo-invoice', { body });
  if (error) throw new Error(error.message);
  if (!(data as any)?.ok) throw new Error((data as any)?.error ?? 'QBO call failed');
  return (data as any).result as T;
}

export function useQboCustomerInvoices(qboCustomerId: string | null | undefined) {
  return useQuery({
    queryKey: ['qbo', 'invoices', 'by-customer', qboCustomerId],
    enabled: !!qboCustomerId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      callQbo<QboInvoiceListResponse>({
        action: 'list-by-customer',
        qbo_customer_id: qboCustomerId,
      }),
  });
}

export function useQboInvoiceDetail(qboInvoiceId: string | null) {
  return useQuery({
    queryKey: ['qbo', 'invoice', 'detail', qboInvoiceId],
    enabled: !!qboInvoiceId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      callQbo<QboInvoiceDetail>({
        action: 'get',
        qbo_invoice_id: qboInvoiceId,
      }),
  });
}
