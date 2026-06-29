-- Create display_ad_advertisers table to track Broadstreet advertisers per organization
CREATE TABLE public.display_ad_advertisers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  network_id text NOT NULL,
  broadstreet_advertiser_id integer NOT NULL,
  advertiser_name text NOT NULL,
  is_auto_created boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  UNIQUE (organization_id, network_id)
);

-- Create display_ad_campaigns table to track campaigns
CREATE TABLE public.display_ad_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  
  -- Broadstreet references
  broadstreet_advertiser_id integer NOT NULL,
  broadstreet_campaign_id integer NOT NULL,
  
  -- Campaign details
  name text NOT NULL,
  ad_type text NOT NULL,
  start_date date NOT NULL,
  end_date date,  -- NULL = infinite (stored as 2999-12-31 in Broadstreet)
  
  -- Status tracking
  is_active boolean NOT NULL DEFAULT true,
  is_auto_created boolean NOT NULL DEFAULT true,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  -- Add constraint for ad_type after creation (to avoid validation issues)
  CONSTRAINT display_ad_campaigns_ad_type_check CHECK (ad_type IN ('billboard', 'skyscraper'))
);

-- Indexes for performance
CREATE INDEX idx_display_ad_advertisers_org ON public.display_ad_advertisers(organization_id);
CREATE INDEX idx_display_ad_campaigns_org ON public.display_ad_campaigns(organization_id);
CREATE INDEX idx_display_ad_campaigns_site ON public.display_ad_campaigns(site_id);
CREATE INDEX idx_display_ad_campaigns_broadstreet ON public.display_ad_campaigns(broadstreet_campaign_id);

-- Enable RLS on both tables
ALTER TABLE public.display_ad_advertisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.display_ad_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS policies for display_ad_advertisers
CREATE POLICY "Admins can manage all display ad advertisers"
ON public.display_ad_advertisers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their org display ad advertisers"
ON public.display_ad_advertisers FOR SELECT
USING (
  has_role(auth.uid(), 'client'::app_role) AND
  organization_id IN (
    SELECT organization_id FROM user_organizations
    WHERE user_id = auth.uid()
  )
);

-- RLS policies for display_ad_campaigns
CREATE POLICY "Admins can manage all display ad campaigns"
ON public.display_ad_campaigns FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their org display ad campaigns"
ON public.display_ad_campaigns FOR SELECT
USING (
  has_role(auth.uid(), 'client'::app_role) AND
  organization_id IN (
    SELECT organization_id FROM user_organizations
    WHERE user_id = auth.uid()
  )
);

-- Add updated_at trigger for display_ad_advertisers
CREATE TRIGGER update_display_ad_advertisers_updated_at
BEFORE UPDATE ON public.display_ad_advertisers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for display_ad_campaigns
CREATE TRIGGER update_display_ad_campaigns_updated_at
BEFORE UPDATE ON public.display_ad_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();