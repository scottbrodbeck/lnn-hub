-- Add Broadstreet display ads configuration to sites table
ALTER TABLE public.sites
ADD COLUMN IF NOT EXISTS broadstreet_config jsonb DEFAULT '{}'::jsonb;

-- Add Broadstreet advertiser fields to organizations table
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS broadstreet_advertiser_id integer,
ADD COLUMN IF NOT EXISTS broadstreet_advertiser_name text;

-- Create display_ad_cache table for caching Broadstreet API responses
CREATE TABLE public.display_ad_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  data jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for efficient cache lookups
CREATE INDEX idx_display_ad_cache_org_key ON public.display_ad_cache(organization_id, cache_key);
CREATE INDEX idx_display_ad_cache_expires ON public.display_ad_cache(expires_at);

-- Enable RLS on display_ad_cache
ALTER TABLE public.display_ad_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies for display_ad_cache
-- Admins can manage all cache entries
CREATE POLICY "Admins can manage all display ad cache"
ON public.display_ad_cache
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their org's cache entries
CREATE POLICY "Clients can view their org display ad cache"
ON public.display_ad_cache
FOR SELECT
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  )
);

-- Add comment for documentation
COMMENT ON TABLE public.display_ad_cache IS 'Cache for Broadstreet API responses to improve dashboard performance';
COMMENT ON COLUMN public.sites.broadstreet_config IS 'JSONB config for Broadstreet display ads: {enabled, billboard_zone_id, skyscraper_zone_id, skyscraper_a_zone_id}';
COMMENT ON COLUMN public.organizations.broadstreet_advertiser_id IS 'Broadstreet advertiser ID for this organization';
COMMENT ON COLUMN public.organizations.broadstreet_advertiser_name IS 'Broadstreet advertiser name (auto-populated from API)';