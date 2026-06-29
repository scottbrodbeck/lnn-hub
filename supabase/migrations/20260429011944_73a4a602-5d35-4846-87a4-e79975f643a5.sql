CREATE TABLE public.qbo_invoice_assignment_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  qbo_invoice_id UUID NOT NULL REFERENCES public.qbo_invoices(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.post_assignments(id) ON DELETE CASCADE,
  deal_product_id UUID,
  cycle_index INTEGER NOT NULL DEFAULT 0,
  position_in_cycle INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (qbo_invoice_id, deal_product_id, cycle_index, position_in_cycle)
);

CREATE INDEX idx_qbo_inv_asg_links_invoice ON public.qbo_invoice_assignment_links(qbo_invoice_id);
CREATE INDEX idx_qbo_inv_asg_links_assignment ON public.qbo_invoice_assignment_links(assignment_id);

ALTER TABLE public.qbo_invoice_assignment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage qbo invoice assignment links"
  ON public.qbo_invoice_assignment_links
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "CRM users view qbo invoice assignment links"
  ON public.qbo_invoice_assignment_links
  FOR SELECT
  USING (has_crm_access(auth.uid()));

INSERT INTO public.crm_settings (key, value)
VALUES (
  'assignment_generation_defaults',
  '{
    "default_months_for_recurring": 3,
    "max_months_for_recurring": 24,
    "default_stagger": "weekly",
    "category_mapping": {
      "Sponsored Posts": { "post_type": "standard", "content_category": "website" },
      "Email":           { "post_type": "standard", "content_category": "email_blast" },
      "Bundles":         { "post_type": "standard", "content_category": "website" },
      "Network Packages":{ "post_type": "standard", "content_category": "website" }
    },
    "skip_categories": ["Display Ads"]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;