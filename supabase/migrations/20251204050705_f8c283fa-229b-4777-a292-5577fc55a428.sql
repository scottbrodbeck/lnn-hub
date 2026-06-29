-- Update RLS policies for column_templates to use user_organizations table
-- instead of the deprecated profiles.organization_id field

-- Drop existing client policies
DROP POLICY IF EXISTS "Clients can view templates for their organization" ON public.column_templates;
DROP POLICY IF EXISTS "Clients can create templates for their organization" ON public.column_templates;
DROP POLICY IF EXISTS "Clients can update templates for their organization" ON public.column_templates;
DROP POLICY IF EXISTS "Clients can delete templates for their organization" ON public.column_templates;

-- Recreate policies using user_organizations table
CREATE POLICY "Clients can view templates for their organization" 
ON public.column_templates 
FOR SELECT 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can create templates for their organization" 
ON public.column_templates 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can update templates for their organization" 
ON public.column_templates 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can delete templates for their organization" 
ON public.column_templates 
FOR DELETE 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT uo.organization_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);