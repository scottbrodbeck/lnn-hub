import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BundleItem = {
  id: string;
  bundle_product_id: string;
  assignment_kind: 'post' | 'display_ad';
  content_category: string | null;
  post_type: string | null;
  quantity: number;
  cadence: 'none' | 'weekly' | 'biweekly' | 'monthly';
  label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BundleItemInput = Omit<BundleItem, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export function useBundleItems(bundleProductId: string | undefined) {
  return useQuery({
    queryKey: ['crm_product_bundle_items', bundleProductId],
    enabled: !!bundleProductId,
    queryFn: async (): Promise<BundleItem[]> => {
      const { data, error } = await supabase
        .from('crm_product_bundle_items' as any)
        .select('*')
        .eq('bundle_product_id', bundleProductId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BundleItem[];
    },
  });
}

export function useSaveBundleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: BundleItemInput) => {
      const { id, ...rest } = item;
      if (id) {
        const { error } = await supabase
          .from('crm_product_bundle_items' as any)
          .update(rest as any)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('crm_product_bundle_items' as any)
          .insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm_product_bundle_items', vars.bundle_product_id] });
      qc.invalidateQueries({ queryKey: ['qbo', 'assignment-plan'] });
      toast.success('Bundle item saved');
    },
    onError: (e: any) => toast.error(e.message ?? 'Save failed'),
  });
}

export function useDeleteBundleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; bundle_product_id: string }) => {
      const { error } = await supabase
        .from('crm_product_bundle_items' as any)
        .delete()
        .eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm_product_bundle_items', vars.bundle_product_id] });
      qc.invalidateQueries({ queryKey: ['qbo', 'assignment-plan'] });
      toast.success('Bundle item removed');
    },
    onError: (e: any) => toast.error(e.message ?? 'Delete failed'),
  });
}

/** Bundle counts per product, for badges in the products list. */
export function useBundleItemCounts(productIds: string[]) {
  return useQuery({
    queryKey: ['crm_product_bundle_items', 'counts', productIds.slice().sort().join(',')],
    enabled: productIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('crm_product_bundle_items' as any)
        .select('bundle_product_id')
        .in('bundle_product_id', productIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data ?? []) {
        const id = (r as any).bundle_product_id as string;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
  });
}
