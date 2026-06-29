import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type QboDiagAction =
  | 'env-info'
  | 'ping'
  | 'token-refresh'
  | 'company-info'
  | 'list-accounts'
  | 'list-customers'
  | 'list-items'
  | 'list-invoices'
  | 'query'
  | 'create-test-customer'
  | 'create-test-item'
  | 'create-test-invoice'
  | 'delete-test-entity';

export type QboDiagPayload = {
  action: QboDiagAction;
  sql?: string;
  income_account_id?: string;
  customer_id?: string;
  item_id?: string;
  entity_type?: 'Invoice' | 'Customer' | 'Item';
  entity_id?: string;
  sync_token?: string;
};

export function useQboDiagnostics() {
  return useMutation({
    mutationFn: async (payload: QboDiagPayload) => {
      const { data, error } = await supabase.functions.invoke('qbo-diagnostics', {
        body: payload,
      });
      if (error) throw error;
      return data as any;
    },
  });
}
