-- ============================================================
-- QBO Phase 1: Auth state + product sync infrastructure
-- ============================================================

-- 1. Token cache (single row, super-admin only)
CREATE TABLE IF NOT EXISTS public.qbo_auth_state (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true), -- enforce single row
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token TEXT,
  refresh_token_expires_at TIMESTAMPTZ,
  realm_id TEXT,
  environment TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qbo_auth_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage QBO auth state"
  ON public.qbo_auth_state
  FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER trg_qbo_auth_state_updated
  BEFORE UPDATE ON public.qbo_auth_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the singleton row so updates work
INSERT INTO public.qbo_auth_state (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

-- 2. crm_products tracking columns
ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS qbo_item_id TEXT,
  ADD COLUMN IF NOT EXISTS qbo_sync_token TEXT,
  ADD COLUMN IF NOT EXISTS qbo_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qbo_sync_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS crm_products_qbo_item_id_uniq
  ON public.crm_products (qbo_item_id)
  WHERE qbo_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_products_qbo_sync_enabled_idx
  ON public.crm_products (qbo_sync_enabled)
  WHERE qbo_sync_enabled = true;

-- 3. Sync run history
CREATE TABLE IF NOT EXISTS public.qbo_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL, -- 'product_match' | 'product_push' | 'product_update' | 'customer_balance' | 'invoice_status'
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'error'
  triggered_by TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'cron' | 'trigger'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  matched_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.qbo_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage QBO sync runs"
  ON public.qbo_sync_runs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "CRM users can view QBO sync runs"
  ON public.qbo_sync_runs
  FOR SELECT
  USING (has_crm_access(auth.uid()));

CREATE INDEX IF NOT EXISTS qbo_sync_runs_started_at_idx
  ON public.qbo_sync_runs (started_at DESC);

-- 4. Default income account stored in crm_settings (already exists)
INSERT INTO public.crm_settings (key, value)
  VALUES ('qbo_settings', '{"default_income_account_id": null, "default_income_account_name": null}'::jsonb)
  ON CONFLICT (key) DO NOTHING;