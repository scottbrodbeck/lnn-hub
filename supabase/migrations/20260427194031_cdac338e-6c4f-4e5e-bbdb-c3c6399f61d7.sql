ALTER TABLE public.crm_sync_state
  ADD COLUMN IF NOT EXISTS pull_mode text NOT NULL DEFAULT 'incremental',
  ADD COLUMN IF NOT EXISTS pull_cursor text,
  ADD COLUMN IF NOT EXISTS backfill_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS backfill_completed_at timestamptz;

ALTER TABLE public.crm_sync_state
  DROP CONSTRAINT IF EXISTS crm_sync_state_pull_mode_check;

ALTER TABLE public.crm_sync_state
  ADD CONSTRAINT crm_sync_state_pull_mode_check
  CHECK (pull_mode IN ('incremental', 'backfill'));