
CREATE TABLE IF NOT EXISTS public.display_ad_campaign_stats_cache (
  campaign_id uuid PRIMARY KEY REFERENCES public.display_ad_campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  views bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  hovers bigint NOT NULL DEFAULT 0,
  ad_count integer NOT NULL DEFAULT 0,
  ad_previews jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_error boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_display_ad_stats_cache_org
  ON public.display_ad_campaign_stats_cache(organization_id);
CREATE INDEX IF NOT EXISTS idx_display_ad_stats_cache_fetched
  ON public.display_ad_campaign_stats_cache(fetched_at);

ALTER TABLE public.display_ad_campaign_stats_cache ENABLE ROW LEVEL SECURITY;

-- Org members can read cached stats for their campaigns
CREATE POLICY "Org members can view their cached campaign stats"
  ON public.display_ad_campaign_stats_cache
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = display_ad_campaign_stats_cache.organization_id
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- Only service role writes; no INSERT/UPDATE/DELETE policies for authenticated.

-- Auto-update updated_at on row modification
CREATE TRIGGER trg_display_ad_stats_cache_updated_at
  BEFORE UPDATE ON public.display_ad_campaign_stats_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
