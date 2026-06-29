-- Drop the existing incorrect policy
DROP POLICY IF EXISTS "Clients can view their organization" ON public.organizations;

-- Create the corrected policy that checks user_organizations table
CREATE POLICY "Clients can view their organization" 
ON public.organizations 
FOR SELECT 
USING (
  has_role(auth.uid(), 'client'::app_role) AND (id IN ( 
    SELECT organization_id
    FROM user_organizations
    WHERE user_id = auth.uid()
  ))
);