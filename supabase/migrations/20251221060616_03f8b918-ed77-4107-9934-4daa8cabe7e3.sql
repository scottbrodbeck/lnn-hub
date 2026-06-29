-- Add skip_type column to post_assignments table
ALTER TABLE public.post_assignments 
ADD COLUMN skip_type text;

-- Add skip_type column to assignment_instances table
ALTER TABLE public.assignment_instances 
ADD COLUMN skip_type text;

-- Add comment for documentation
COMMENT ON COLUMN public.post_assignments.skip_type IS 'Type of skip: user_skipped or admin_canceled';
COMMENT ON COLUMN public.assignment_instances.skip_type IS 'Type of skip: user_skipped or admin_canceled';