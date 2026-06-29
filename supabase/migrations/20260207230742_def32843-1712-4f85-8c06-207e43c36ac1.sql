
-- Create table to track ad placement history in campaigns
CREATE TABLE public.display_ad_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.display_ad_campaigns(id) ON DELETE CASCADE,
  broadstreet_advertisement_id integer NOT NULL,
  broadstreet_placement_ids integer[] DEFAULT '{}',
  ad_name text NOT NULL DEFAULT '',
  ad_image_url text,
  ad_width integer DEFAULT 0,
  ad_height integer DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  final_stats jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.display_ad_placements ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all display ad placements"
  ON public.display_ad_placements
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view placements for their org's campaigns
CREATE POLICY "Clients can view placements for their campaigns"
  ON public.display_ad_placements
  FOR SELECT
  USING (
    has_role(auth.uid(), 'client'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.display_ad_campaigns c
      JOIN public.user_organizations uo ON uo.organization_id = c.organization_id
      WHERE c.id = display_ad_placements.campaign_id
      AND uo.user_id = auth.uid()
    )
  );

-- Index for fast lookups by campaign
CREATE INDEX idx_display_ad_placements_campaign_id ON public.display_ad_placements(campaign_id);
CREATE INDEX idx_display_ad_placements_active ON public.display_ad_placements(campaign_id, is_active);
