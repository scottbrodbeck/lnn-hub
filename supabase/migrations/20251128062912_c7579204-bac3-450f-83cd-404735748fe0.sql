-- Update RLS policies for column_templates to allow clients to manage templates for their organization

-- Drop existing client view policy
DROP POLICY IF EXISTS "Clients can view active templates for their organization" ON public.column_templates;

-- Create new policies for clients
CREATE POLICY "Clients can view templates for their organization"
ON public.column_templates
FOR SELECT
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Clients can create templates for their organization"
ON public.column_templates
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Clients can update templates for their organization"
ON public.column_templates
FOR UPDATE
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Clients can delete templates for their organization"
ON public.column_templates
FOR DELETE
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);