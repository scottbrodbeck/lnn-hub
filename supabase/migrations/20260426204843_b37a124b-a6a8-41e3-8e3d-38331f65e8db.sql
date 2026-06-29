-- Per-product sync toggle on crm_products
ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS hubspot_sync_enabled boolean NOT NULL DEFAULT false;

-- Mapping table between local products and HubSpot products
CREATE TABLE IF NOT EXISTS public.crm_product_hubspot_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_product_id uuid NOT NULL REFERENCES public.crm_products(id) ON DELETE CASCADE,
  hubspot_product_id text NOT NULL,
  hubspot_name text,
  hubspot_price numeric,
  linked_by uuid,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_pushed_at timestamptz,
  last_push_status text,
  last_push_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_product_hubspot_links_local_uniq
  ON public.crm_product_hubspot_links (crm_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_product_hubspot_links_remote_uniq
  ON public.crm_product_hubspot_links (hubspot_product_id);

ALTER TABLE public.crm_product_hubspot_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM users manage hubspot product links"
  ON public.crm_product_hubspot_links
  FOR ALL
  USING (public.has_crm_access(auth.uid()))
  WITH CHECK (public.has_crm_access(auth.uid()));

CREATE TRIGGER crm_product_hubspot_links_updated_at
  BEFORE UPDATE ON public.crm_product_hubspot_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed master toggle (off by default)
INSERT INTO public.crm_settings (key, value)
VALUES ('hubspot_sync_globally_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;