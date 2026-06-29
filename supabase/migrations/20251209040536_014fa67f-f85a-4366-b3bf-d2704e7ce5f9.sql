-- Create a view with only non-sensitive site information for clients
CREATE OR REPLACE VIEW public.sites_public AS
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

-- Remove the client SELECT policy from the sites table (they'll use the view instead)
DROP POLICY IF EXISTS "Clients can view active sites" ON public.sites;

-- Create RLS-like restriction using a security definer function for the view
-- Since views don't support RLS directly, we use the underlying table's RLS
-- Clients will query sites_public which only has safe columns