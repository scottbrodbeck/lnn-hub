-- Drop the existing constraint
ALTER TABLE admin_daily_checklist 
DROP CONSTRAINT IF EXISTS admin_daily_checklist_item_type_check;

-- Add updated constraint with 'assignment' included
ALTER TABLE admin_daily_checklist 
ADD CONSTRAINT admin_daily_checklist_item_type_check 
CHECK (item_type = ANY (ARRAY['post'::text, 'email_blast'::text, 'email_sponsorship'::text, 'assignment'::text]));