-- Make due_date nullable for assignments without a set publication date
ALTER TABLE public.post_assignments 
ALTER COLUMN due_date DROP NOT NULL;