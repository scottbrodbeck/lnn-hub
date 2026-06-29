-- Add is_skipped column to post_assignments for one-time assignments
ALTER TABLE public.post_assignments ADD COLUMN is_skipped boolean NOT NULL DEFAULT false;