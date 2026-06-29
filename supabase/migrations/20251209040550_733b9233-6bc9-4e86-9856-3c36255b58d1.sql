-- Fix the view to use SECURITY INVOKER (the default, but let's be explicit)
DROP VIEW IF EXISTS public.sites_public;

CREATE VIEW public.sites_public 
WITH (security_invoker = true) AS
SELECT 
  id,
  name,
  url,
  is_active,
  created_at,
  updated_at
FROM public.sites;

-- Grant access to the view
GRANT SELECT ON public.sites_public TO authenticated;
GRANT SELECT ON public.sites_public TO anon;

-- Add a policy on sites table that allows authenticated users to read non-sensitive columns via the view
-- The view will inherit the base table's RLS, so we need a policy for authenticated users
CREATE POLICY "Authenticated users can view site basic info via view" ON public.sites
FOR SELECT USING (is_active = true AND auth.uid() IS NOT NULL);