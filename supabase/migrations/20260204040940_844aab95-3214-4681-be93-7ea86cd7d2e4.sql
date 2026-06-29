-- Table for tracking daily admin checklist items
CREATE TABLE public.admin_daily_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'email_blast', 'email_sponsorship')),
  item_id UUID NOT NULL,
  checklist_date DATE NOT NULL DEFAULT CURRENT_DATE,
  checked_by UUID NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_type, item_id, checklist_date)
);

-- Enable RLS
ALTER TABLE public.admin_daily_checklist ENABLE ROW LEVEL SECURITY;

-- Only admins can manage checklist
CREATE POLICY "Admins can manage daily checklist"
  ON public.admin_daily_checklist
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));