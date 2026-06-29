-- Drop the old constraint with incorrect values
ALTER TABLE public.post_assignments 
DROP CONSTRAINT IF EXISTS content_category_check;

-- Add new constraint with correct values matching frontend
ALTER TABLE public.post_assignments 
ADD CONSTRAINT content_category_check 
CHECK (content_category IN ('website', 'email_blast', 'email_sponsorship'));