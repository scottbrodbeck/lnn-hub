CREATE TABLE public.qa_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  external_id text,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all QA checks"
  ON public.qa_checks FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_qa_checks_entity ON public.qa_checks(entity_type, entity_id);
CREATE INDEX idx_qa_checks_status ON public.qa_checks(status);
CREATE INDEX idx_qa_checks_checked_at ON public.qa_checks(checked_at DESC);