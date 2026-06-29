-- Phase 2: QBO customer linking + cached balances on crm_organizations
ALTER TABLE public.crm_organizations
  ADD COLUMN IF NOT EXISTS qbo_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS qbo_customer_name TEXT,
  ADD COLUMN IF NOT EXISTS qbo_sync_token TEXT,
  ADD COLUMN IF NOT EXISTS qbo_balance NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS qbo_balance_with_jobs NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS qbo_currency TEXT,
  ADD COLUMN IF NOT EXISTS qbo_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS qbo_last_invoice_date DATE,
  ADD COLUMN IF NOT EXISTS qbo_last_payment_date DATE,
  ADD COLUMN IF NOT EXISTS qbo_balance_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qbo_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_organizations_qbo_customer_id
  ON public.crm_organizations (qbo_customer_id) WHERE qbo_customer_id IS NOT NULL;

-- Extend qbo_sync_runs kind to include customer-related runs (no constraint change needed; kind is freeform text).
-- But ensure the table exists (created in Phase 1) — no-op alter to verify presence.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='qbo_sync_runs') THEN
    RAISE EXCEPTION 'qbo_sync_runs table missing; run Phase 1 migration first';
  END IF;
END $$;