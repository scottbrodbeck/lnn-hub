-- Add organization_id column to post_assignments
ALTER TABLE public.post_assignments
ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

-- Migrate existing data: set organization_id based on assigned_to user's primary organization
UPDATE public.post_assignments pa
SET organization_id = (
  SELECT uo.organization_id 
  FROM user_organizations uo 
  WHERE uo.user_id = pa.assigned_to 
  AND uo.is_primary = true
  LIMIT 1
)
WHERE pa.assigned_to IS NOT NULL AND pa.organization_id IS NULL;

-- If no primary org found, try any org the user belongs to
UPDATE public.post_assignments pa
SET organization_id = (
  SELECT uo.organization_id 
  FROM user_organizations uo 
  WHERE uo.user_id = pa.assigned_to 
  LIMIT 1
)
WHERE pa.assigned_to IS NOT NULL AND pa.organization_id IS NULL;

-- Drop old RLS policies for post_assignments
DROP POLICY IF EXISTS "Clients can view their assignments" ON public.post_assignments;
DROP POLICY IF EXISTS "Clients can update assignment status" ON public.post_assignments;

-- Create new organization-based RLS policies for post_assignments
CREATE POLICY "Clients can view their org assignments" 
ON public.post_assignments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM user_organizations 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clients can update their org assignments" 
ON public.post_assignments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM user_organizations 
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) 
  AND organization_id IN (
    SELECT organization_id FROM user_organizations 
    WHERE user_id = auth.uid()
  )
);

-- Drop old RLS policies for assignment_instances
DROP POLICY IF EXISTS "Clients can view their instances" ON public.assignment_instances;
DROP POLICY IF EXISTS "Clients can insert their instances" ON public.assignment_instances;
DROP POLICY IF EXISTS "Clients can update their instances" ON public.assignment_instances;

-- Create new organization-based RLS policies for assignment_instances
CREATE POLICY "Clients can view their org instances" 
ON public.assignment_instances 
FOR SELECT 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND assignment_id IN (
    SELECT pa.id FROM post_assignments pa
    WHERE pa.organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Clients can insert their org instances" 
ON public.assignment_instances 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) 
  AND assignment_id IN (
    SELECT pa.id FROM post_assignments pa
    WHERE pa.organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Clients can update their org instances" 
ON public.assignment_instances 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'client'::app_role) 
  AND assignment_id IN (
    SELECT pa.id FROM post_assignments pa
    WHERE pa.organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) 
  AND assignment_id IN (
    SELECT pa.id FROM post_assignments pa
    WHERE pa.organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  )
);