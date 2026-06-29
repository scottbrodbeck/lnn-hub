-- New crm_settings table for lookup lists (deal sources, lost reasons, etc.)
CREATE TABLE public.crm_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;

-- Read: anyone with CRM access
CREATE POLICY "CRM users can read settings"
  ON public.crm_settings
  FOR SELECT
  USING (public.has_crm_access(auth.uid()));

-- Write: admins / super_admins only
CREATE POLICY "Admins manage CRM settings insert"
  ON public.crm_settings
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage CRM settings update"
  ON public.crm_settings
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage CRM settings delete"
  ON public.crm_settings
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_crm_settings_updated_at
  BEFORE UPDATE ON public.crm_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the two known lookup keys
INSERT INTO public.crm_settings (key, value) VALUES
  ('deal_sources', '[]'::jsonb),
  ('lost_reasons', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;