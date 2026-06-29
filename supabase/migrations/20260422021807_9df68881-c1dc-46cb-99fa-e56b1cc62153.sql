-- 1. Add source tracking columns to crm_products
ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_synced_at timestamptz;

-- 2. Unique index on sku for LNN-sourced products (drives upsert)
CREATE UNIQUE INDEX IF NOT EXISTS crm_products_lnn_sku_unique
  ON public.crm_products (sku)
  WHERE source = 'lnn_pricing_api';

-- 3. Sync runs audit table
CREATE TABLE IF NOT EXISTS public.crm_product_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'lnn_pricing_api',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_count int NOT NULL DEFAULT 0,
  updated_count int NOT NULL DEFAULT 0,
  archived_count int NOT NULL DEFAULT 0,
  unchanged_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  error text,
  triggered_by text NOT NULL DEFAULT 'cron'
);

ALTER TABLE public.crm_product_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM users can view product sync runs"
  ON public.crm_product_sync_runs
  FOR SELECT
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Admins can manage product sync runs"
  ON public.crm_product_sync_runs
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS crm_product_sync_runs_started_at_idx
  ON public.crm_product_sync_runs (started_at DESC);