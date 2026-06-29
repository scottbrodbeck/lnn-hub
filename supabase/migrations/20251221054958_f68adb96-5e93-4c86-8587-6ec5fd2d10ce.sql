-- Add started_at column to post_assignments
ALTER TABLE public.post_assignments ADD COLUMN started_at timestamp with time zone;

-- Add started_at column to assignment_instances
ALTER TABLE public.assignment_instances ADD COLUMN started_at timestamp with time zone;