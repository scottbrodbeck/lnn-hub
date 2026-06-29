-- Create assignment_instances table for tracking individual recurring assignment instances
CREATE TABLE assignment_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES post_assignments(id) ON DELETE CASCADE,
  instance_date DATE NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  submitted_post_id UUID REFERENCES posts(id),
  -- For instance-specific overrides (exceptions)
  is_exception BOOLEAN NOT NULL DEFAULT false,
  exception_notes TEXT,
  -- If this instance has been modified from the parent
  overridden_assignment_name TEXT,
  overridden_due_date DATE,
  is_skipped BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, instance_date)
);

-- Enable RLS
ALTER TABLE assignment_instances ENABLE ROW LEVEL SECURITY;

-- Admins can manage all instances
CREATE POLICY "Admins can manage all instances"
ON assignment_instances
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their assignment instances
CREATE POLICY "Clients can view their instances"
ON assignment_instances
FOR SELECT
TO authenticated
USING (
  assignment_id IN (
    SELECT id FROM post_assignments 
    WHERE assigned_to = auth.uid()
  ) AND has_role(auth.uid(), 'client'::app_role)
);

-- Clients can update their assignment instances
CREATE POLICY "Clients can update their instances"
ON assignment_instances
FOR UPDATE
TO authenticated
USING (
  assignment_id IN (
    SELECT id FROM post_assignments 
    WHERE assigned_to = auth.uid()
  ) AND has_role(auth.uid(), 'client'::app_role)
)
WITH CHECK (
  assignment_id IN (
    SELECT id FROM post_assignments 
    WHERE assigned_to = auth.uid()
  ) AND has_role(auth.uid(), 'client'::app_role)
);

-- Clients can insert their assignment instances
CREATE POLICY "Clients can insert their instances"
ON assignment_instances
FOR INSERT
TO authenticated
WITH CHECK (
  assignment_id IN (
    SELECT id FROM post_assignments 
    WHERE assigned_to = auth.uid()
  ) AND has_role(auth.uid(), 'client'::app_role)
);

-- Add trigger for updated_at
CREATE TRIGGER update_assignment_instances_updated_at
BEFORE UPDATE ON assignment_instances
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();