ALTER TABLE public.qbo_invoice_assignment_links
  ALTER COLUMN qbo_invoice_id DROP NOT NULL;

ALTER TABLE public.qbo_invoice_assignment_links
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.crm_deals(id) ON DELETE CASCADE;

ALTER TABLE public.qbo_invoice_assignment_links
  ADD CONSTRAINT qial_source_chk CHECK (qbo_invoice_id IS NOT NULL OR deal_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_qial_deal
  ON public.qbo_invoice_assignment_links(deal_id);