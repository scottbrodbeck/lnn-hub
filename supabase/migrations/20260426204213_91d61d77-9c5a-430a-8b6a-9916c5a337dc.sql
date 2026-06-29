ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS upstream_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS crm_products_upstream_uniq
  ON public.crm_products (upstream_id, billing_cycle, variant_slug)
  WHERE upstream_id IS NOT NULL;