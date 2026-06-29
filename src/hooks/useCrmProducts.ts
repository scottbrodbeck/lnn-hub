import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CrmBillingCycle = 'one_time' | 'monthly' | 'quarterly' | 'annual';

export type CrmProductSource = 'manual' | 'lnn_pricing_api';

export type CrmProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  unit_price: number;
  billing_cycle: CrmBillingCycle;
  is_active: boolean;
  source: CrmProductSource;
  source_synced_at: string | null;
  source_key: string | null;
  upstream_id: string | null;
  site_slug: string | null;
  variant_slug: string | null;
  import_batch_id: string | null;
  hubspot_sync_enabled: boolean;
  qbo_item_id: string | null;
  qbo_item_name: string | null;
  qbo_sync_token: string | null;
  
  qbo_synced_at: string | null;
  qbo_sync_error: string | null;
  qbo_environment: string | null;
  qbo_sync_fields: 'price' | 'price_name' | 'price_name_description';
  created_at: string;
  updated_at: string;
};

export type ProductsFilters = {
  search?: string;
  category?: string;
  activeOnly?: boolean;
};

export function useCrmProducts(filters: ProductsFilters = {}) {
  return useQuery({
    queryKey: ['crm', 'products', filters],
    queryFn: async (): Promise<CrmProduct[]> => {
      let q = supabase.from('crm_products').select('*').order('name', { ascending: true });
      if (filters.activeOnly) q = q.eq('is_active', true);
      if (filters.category) q = q.eq('category', filters.category);
      if (filters.search?.trim()) {
        const s = filters.search.trim();
        q = q.ilike('name', `%${s}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CrmProduct[];
    },
  });
}

export function useCreateCrmProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CrmProduct>) => {
      const { data, error } = await supabase
        .from('crm_products')
        .insert({
          name: input.name!,
          description: input.description ?? null,
          category: input.category ?? null,
          unit_price: input.unit_price ?? 0,
          billing_cycle: (input.billing_cycle ?? 'one_time') as any,
          is_active: input.is_active ?? true,
          site_slug: input.site_slug ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      qc.invalidateQueries({ queryKey: ['crm', 'products-lite'] });
      toast.success('Product created');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCrmProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmProduct> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_products')
        .update(patch as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'products'] });
      qc.invalidateQueries({ queryKey: ['crm', 'products-lite'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useArchiveCrmProduct() {
  const update = useUpdateCrmProduct();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      update.mutateAsync({ id, is_active } as any),
  });
}
