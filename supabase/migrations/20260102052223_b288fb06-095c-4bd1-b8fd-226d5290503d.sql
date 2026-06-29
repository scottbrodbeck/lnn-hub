-- Remove the overly permissive SELECT policy that exposes WordPress credentials to non-admins
DROP POLICY IF EXISTS "Authenticated users can view site basic info via view" ON public.sites;