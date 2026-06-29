import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CrmDealProduct = {
  id: string;
  deal_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type CrmDealProductRow = CrmDealProduct & {
  product_name: string | null;
  product_category: string | null;
};

function calcTotal(quantity: number, unitPrice: number, discountPct: number) {
  const gross = Number(quantity) * Number(unitPrice);
  const net = gross * (1 - Number(discountPct) / 100);
  return Math.round(net * 100) / 100;
}

export function useCrmDealProducts(dealId?: string) {
  return useQuery({
    queryKey: ['crm', 'deal-products', dealId],
    enabled: !!dealId,
    queryFn: async (): Promise<CrmDealProductRow[]> => {
      const { data, error } = await supabase
        .from('crm_deal_products')
        .select(`*, product:crm_products(id,name,category)`)
        .eq('deal_id', dealId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        product_name: r.product?.name ?? null,
        product_category: r.product?.category ?? null,
      }));
    },
  });
}

export function useAddDealProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<Partial<CrmDealProduct>, 'total'> & { deal_id: string; product_id: string }
    ) => {
      const quantity = input.quantity ?? 1;
      const unit_price = input.unit_price ?? 0;
      const discount_pct = input.discount_pct ?? 0;
      const total = calcTotal(quantity, unit_price, discount_pct);
      const { data, error } = await supabase
        .from('crm_deal_products')
        .insert({
          deal_id: input.deal_id,
          product_id: input.product_id,
          quantity,
          unit_price,
          discount_pct,
          total,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['crm', 'deal-products', vars.deal_id] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateDealProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      deal_id,
      ...patch
    }: Partial<CrmDealProduct> & { id: string; deal_id: string }) => {
      const merged = { ...patch } as any;
      if (
        merged.quantity !== undefined ||
        merged.unit_price !== undefined ||
        merged.discount_pct !== undefined
      ) {
        const { data: existing } = await supabase
          .from('crm_deal_products')
          .select('quantity,unit_price,discount_pct')
          .eq('id', id)
          .single();
        const q = merged.quantity ?? existing?.quantity ?? 1;
        const up = merged.unit_price ?? existing?.unit_price ?? 0;
        const d = merged.discount_pct ?? existing?.discount_pct ?? 0;
        merged.total = calcTotal(q, up, d);
      }
      const { data, error } = await supabase
        .from('crm_deal_products')
        .update(merged)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['crm', 'deal-products', vars.deal_id] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRemoveDealProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, deal_id: _ }: { id: string; deal_id: string }) => {
      const { error } = await supabase.from('crm_deal_products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['crm', 'deal-products', vars.deal_id] }),
    onError: (e: any) => toast.error(e.message),
  });
}
