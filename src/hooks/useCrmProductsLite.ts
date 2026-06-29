import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CrmProductLite = {
  id: string;
  name: string;
  unit_price: number;
  is_active: boolean;
  category: string | null;
  site_slug: string | null;
  billing_cycle: 'one_time' | 'monthly' | 'quarterly' | 'annual';
};

export function useCrmProductsLite() {
  return useQuery({
    queryKey: ['crm', 'products', 'lite'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_products')
        .select('id,name,unit_price,is_active,category,site_slug,billing_cycle')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as CrmProductLite[];
    },
  });
}
