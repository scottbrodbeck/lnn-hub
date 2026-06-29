CREATE OR REPLACE FUNCTION public.get_onboarding_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'welcome_card_enabled',
      COALESCE((SELECT value FROM public.admin_settings WHERE key = 'onboarding_welcome_card_enabled'), 'false'::jsonb),
    'guide_enabled',
      COALESCE((SELECT value FROM public.admin_settings WHERE key = 'onboarding_guide_enabled'), 'false'::jsonb),
    'guide_content',
      COALESCE((SELECT value FROM public.admin_settings WHERE key = 'onboarding_guide_content'), '""'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_onboarding_settings() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_settings() TO authenticated;