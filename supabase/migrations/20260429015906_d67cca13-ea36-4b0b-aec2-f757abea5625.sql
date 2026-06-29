ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS qbo_environment text;

COMMENT ON COLUMN public.crm_products.qbo_environment IS 'QuickBooks environment (sandbox|production) the qbo_item_id was linked under. Used to detect stale links after environment change.';