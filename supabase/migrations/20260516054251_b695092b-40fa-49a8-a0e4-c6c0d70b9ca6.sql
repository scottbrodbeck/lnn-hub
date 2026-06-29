ALTER TABLE public.crm_products
  ADD COLUMN qbo_sync_fields text NOT NULL DEFAULT 'price'
  CHECK (qbo_sync_fields IN ('price', 'price_name', 'price_name_description'));