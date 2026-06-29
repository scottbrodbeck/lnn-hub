
-- Create sponsors table
CREATE TABLE public.sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  logo_url text NOT NULL,
  link_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all sponsors"
  ON public.sponsors FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their org sponsors"
  ON public.sponsors FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'client'::app_role) AND organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Clients can insert sponsors for their org"
  ON public.sponsors FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'client'::app_role) AND organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Clients can update their org sponsors"
  ON public.sponsors FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'client'::app_role) AND organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Create wordpress_sponsor_mappings table
CREATE TABLE public.wordpress_sponsor_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  wordpress_sponsor_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id, site_id)
);

ALTER TABLE public.wordpress_sponsor_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sponsor mappings"
  ON public.wordpress_sponsor_mappings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add sponsor_id to posts table
ALTER TABLE public.posts ADD COLUMN sponsor_id uuid REFERENCES public.sponsors(id) ON DELETE SET NULL;

-- Add updated_at trigger on sponsors
CREATE TRIGGER update_sponsors_updated_at
  BEFORE UPDATE ON public.sponsors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wordpress_sponsor_mappings_updated_at
  BEFORE UPDATE ON public.wordpress_sponsor_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
