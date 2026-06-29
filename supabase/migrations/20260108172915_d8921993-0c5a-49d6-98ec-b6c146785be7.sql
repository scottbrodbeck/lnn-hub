-- Add SELECT policy for authenticated users to view sites
CREATE POLICY "Authenticated users can view sites"
ON public.sites
FOR SELECT
TO authenticated
USING (true);