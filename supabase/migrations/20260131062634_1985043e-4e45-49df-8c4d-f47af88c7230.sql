-- ============================================
-- Email Marketing Schema Migration
-- ============================================

-- 1. Create email_blasts table
CREATE TABLE public.email_blasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.post_assignments(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Core fields (traditional)
  title TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  main_image_url TEXT NOT NULL,
  click_url TEXT NOT NULL,
  
  -- New optional fields
  headline TEXT,
  body_content TEXT, -- Rich text HTML
  cta_button_text TEXT,
  cta_button_url TEXT,
  secondary_image_url TEXT,
  
  -- Beehiiv integration
  beehiiv_post_id TEXT,
  beehiiv_post_url TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'published')),
  scheduled_date DATE,
  submitted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create email_sponsorships table
CREATE TABLE public.email_sponsorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.post_assignments(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Banner details
  banner_image_url TEXT NOT NULL,
  click_url TEXT NOT NULL,
  
  -- Week info (runs Monday-Sunday)
  week_start_date DATE NOT NULL,
  submission_deadline DATE NOT NULL, -- Previous Thursday
  
  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Add design request fields to support_requests
ALTER TABLE public.support_requests 
ADD COLUMN IF NOT EXISTS request_category TEXT NOT NULL DEFAULT 'support',
ADD COLUMN IF NOT EXISTS design_type TEXT,
ADD COLUMN IF NOT EXISTS design_specs JSONB;

-- Add constraint for request_category
ALTER TABLE public.support_requests 
ADD CONSTRAINT support_requests_request_category_check 
CHECK (request_category IN ('support', 'design'));

-- Add constraint for design_type
ALTER TABLE public.support_requests 
ADD CONSTRAINT support_requests_design_type_check 
CHECK (design_type IS NULL OR design_type IN ('email_blast', 'email_sponsorship', 'display_ad'));

-- 4. Add Beehiiv configuration to sites
ALTER TABLE public.sites 
ADD COLUMN IF NOT EXISTS beehiiv_config JSONB DEFAULT '{}';

-- 5. Create indexes for performance
CREATE INDEX idx_email_blasts_site_id ON public.email_blasts(site_id);
CREATE INDEX idx_email_blasts_assignment_id ON public.email_blasts(assignment_id);
CREATE INDEX idx_email_blasts_scheduled_date ON public.email_blasts(scheduled_date);
CREATE INDEX idx_email_blasts_status ON public.email_blasts(status);
CREATE INDEX idx_email_sponsorships_site_id ON public.email_sponsorships(site_id);
CREATE INDEX idx_email_sponsorships_assignment_id ON public.email_sponsorships(assignment_id);
CREATE INDEX idx_email_sponsorships_week_start_date ON public.email_sponsorships(week_start_date);
CREATE INDEX idx_email_sponsorships_status ON public.email_sponsorships(status);

-- 6. Create triggers for updated_at
CREATE TRIGGER update_email_blasts_updated_at
BEFORE UPDATE ON public.email_blasts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_sponsorships_updated_at
BEFORE UPDATE ON public.email_sponsorships
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Enable RLS
ALTER TABLE public.email_blasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sponsorships ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for email_blasts
CREATE POLICY "Admins can manage all email blasts"
ON public.email_blasts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their org email blasts"
ON public.email_blasts
FOR SELECT
USING (
  has_role(auth.uid(), 'client'::app_role) AND 
  organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clients can create email blasts for their org"
ON public.email_blasts
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) AND 
  (client_id = auth.uid()) AND
  organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clients can update their org email blasts"
ON public.email_blasts
FOR UPDATE
USING (
  has_role(auth.uid(), 'client'::app_role) AND 
  organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) AND 
  organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

-- 9. RLS Policies for email_sponsorships
CREATE POLICY "Admins can manage all email sponsorships"
ON public.email_sponsorships
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their org email sponsorships"
ON public.email_sponsorships
FOR SELECT
USING (
  has_role(auth.uid(), 'client'::app_role) AND 
  organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clients can create email sponsorships for their org"
ON public.email_sponsorships
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) AND 
  (client_id = auth.uid()) AND
  organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clients can update their org email sponsorships"
ON public.email_sponsorships
FOR UPDATE
USING (
  has_role(auth.uid(), 'client'::app_role) AND 
  organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) AND 
  organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  )
);