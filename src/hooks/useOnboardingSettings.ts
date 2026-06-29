import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OnboardingSettings {
  welcomeCardEnabled: boolean;
  guideEnabled: boolean;
  guideContent: string;
}

// admin_settings is admin-only RLS, so clients read these three onboarding
// values through the get_onboarding_settings() SECURITY DEFINER RPC, which
// returns nothing else. Both flags default off; content defaults empty.
function asBool(v: unknown): boolean {
  return v === true || v === 'true';
}

export function useOnboardingSettings() {
  return useQuery({
    queryKey: ['onboarding-settings'],
    queryFn: async (): Promise<OnboardingSettings> => {
      const { data, error } = await supabase.rpc('get_onboarding_settings');
      if (error) throw error;
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        welcomeCardEnabled: asBool(row.welcome_card_enabled),
        guideEnabled: asBool(row.guide_enabled),
        guideContent: typeof row.guide_content === 'string' ? row.guide_content : '',
      };
    },
  });
}
