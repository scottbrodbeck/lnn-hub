ALTER TABLE public.admin_daily_checklist
  DROP CONSTRAINT IF EXISTS admin_daily_checklist_item_type_check;

ALTER TABLE public.admin_daily_checklist
  ADD CONSTRAINT admin_daily_checklist_item_type_check
  CHECK (item_type = ANY (ARRAY['post','email_blast','email_sponsorship','assignment','social_post']));