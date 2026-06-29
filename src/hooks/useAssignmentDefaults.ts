import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CategoryRule = {
  post_type: string;
  content_category: string;
  assignment_kind: 'post' | 'display_ad' | 'bundle';
};

export type AssignmentDefaults = {
  default_months_for_recurring: number;
  max_months_for_recurring: number;
  default_stagger: 'none' | 'weekly' | 'biweekly';
  category_mapping: Record<string, CategoryRule>;
  category_aliases?: Record<string, string>;
  skip_categories?: string[];
};

const FALLBACK: AssignmentDefaults = {
  default_months_for_recurring: 3,
  max_months_for_recurring: 24,
  default_stagger: 'weekly',
  category_mapping: {
    'Sponsored Posts': { post_type: 'standard', content_category: 'website', assignment_kind: 'post' },
    'Email': { post_type: 'standard', content_category: 'email_blast', assignment_kind: 'post' },
    'Bundles': { post_type: 'standard', content_category: 'website', assignment_kind: 'bundle' },
    'Network Packages': { post_type: 'standard', content_category: 'website', assignment_kind: 'post' },
    'Display Ads': { post_type: 'standard', content_category: 'website', assignment_kind: 'display_ad' },
  },
  category_aliases: {
    'display ad': 'Display Ads',
    'sponsored post': 'Sponsored Posts',
    'emails': 'Email',
    'email blast': 'Email',
    'bundle': 'Bundles',
    'network package': 'Network Packages',
  },
};

export function useAssignmentDefaults() {
  return useQuery({
    queryKey: ['crm_settings', 'assignment_generation_defaults'],
    queryFn: async (): Promise<AssignmentDefaults> => {
      const { data, error } = await supabase
        .from('crm_settings')
        .select('value')
        .eq('key', 'assignment_generation_defaults')
        .maybeSingle();
      if (error) throw error;
      if (!data?.value) return FALLBACK;
      const v = data.value as Partial<AssignmentDefaults>;
      return {
        ...FALLBACK,
        ...v,
        category_mapping: { ...FALLBACK.category_mapping, ...(v.category_mapping ?? {}) },
        category_aliases: { ...(FALLBACK.category_aliases ?? {}), ...(v.category_aliases ?? {}) },
      };
    },
  });
}

export function useSaveAssignmentDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: AssignmentDefaults) => {
      const { error } = await supabase
        .from('crm_settings')
        .upsert({ key: 'assignment_generation_defaults', value: value as any, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm_settings', 'assignment_generation_defaults'] });
      qc.invalidateQueries({ queryKey: ['qbo', 'assignment-plan'] });
      toast.success('Assignment defaults saved');
    },
    onError: (e: any) => toast.error(e.message ?? 'Save failed'),
  });
}

/** Distinct product categories present in `crm_products`, for the unmapped-categories panel. */
export function useDistinctProductCategories() {
  return useQuery({
    queryKey: ['crm_products', 'distinct-categories'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('crm_products')
        .select('category')
        .eq('is_active', true)
        .not('category', 'is', null);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of data ?? []) {
        const c = (r as any).category as string | null;
        if (c && c.trim()) set.add(c.trim());
      }
      return Array.from(set).sort();
    },
  });
}
