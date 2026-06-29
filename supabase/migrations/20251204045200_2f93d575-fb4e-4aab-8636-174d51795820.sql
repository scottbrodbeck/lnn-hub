-- Create user_organizations junction table
CREATE TABLE public.user_organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

-- Enable RLS
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

-- Users can view their own organization memberships
CREATE POLICY "Users can view own organization memberships"
ON public.user_organizations
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can manage all organization memberships
CREATE POLICY "Admins can manage all organization memberships"
ON public.user_organizations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing data from profiles.organization_id to user_organizations
INSERT INTO public.user_organizations (user_id, organization_id, is_primary)
SELECT id, organization_id, true
FROM public.profiles
WHERE organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;