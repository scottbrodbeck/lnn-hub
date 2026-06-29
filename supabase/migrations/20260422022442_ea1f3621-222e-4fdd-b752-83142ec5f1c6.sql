
-- Drop SKU column and add normalized identity columns for LNN-sourced products
ALTER TABLE public.crm_products DROP COLUMN IF EXISTS sku;

ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS site_slug text,
  ADD COLUMN IF NOT EXISTS variant_slug text,
  ADD COLUMN IF NOT EXISTS source_key text;

-- Deterministic identity for synced products: source + key
-- source_key format: "{category}.{site_slug}.{variant_slug}.{billing_cycle}"
CREATE UNIQUE INDEX IF NOT EXISTS crm_products_source_key_unique
  ON public.crm_products (source, source_key)
  WHERE source = 'lnn_pricing_api' AND source_key IS NOT NULL;
