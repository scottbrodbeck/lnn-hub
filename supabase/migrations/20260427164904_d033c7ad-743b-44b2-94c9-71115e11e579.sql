
-- 1. Block destructive ops at the DB layer (only allow safe op types)
-- First, clean up any existing archive rows so the constraint can be added
UPDATE public.crm_sync_outbox SET status = 'cancelled'
  WHERE op NOT IN ('create','update','associate') AND status IN ('pending','error');

ALTER TABLE public.crm_sync_outbox
  DROP CONSTRAINT IF EXISTS crm_sync_outbox_op_safe;
ALTER TABLE public.crm_sync_outbox
  ADD CONSTRAINT crm_sync_outbox_op_safe
  CHECK (op IN ('create','update','associate'));

-- 2. Dedupe identical operations
ALTER TABLE public.crm_sync_outbox
  DROP CONSTRAINT IF EXISTS crm_sync_outbox_idem_unique;
ALTER TABLE public.crm_sync_outbox
  ADD CONSTRAINT crm_sync_outbox_idem_unique UNIQUE (idempotency_key);

-- 3. Per-user rolling minute quota table
CREATE TABLE IF NOT EXISTS public.crm_user_push_quota (
  user_id uuid NOT NULL,
  window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);
ALTER TABLE public.crm_user_push_quota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own quota" ON public.crm_user_push_quota;
CREATE POLICY "users see own quota" ON public.crm_user_push_quota
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "admins manage quota" ON public.crm_user_push_quota;
CREATE POLICY "admins manage quota" ON public.crm_user_push_quota
  FOR ALL USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- 4. Trigger: enforce auth + per-user rate limit on outbox inserts
CREATE OR REPLACE FUNCTION public.guard_crm_outbox_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  v_limit int := 30;
  v_settings jsonb;
  v_window timestamptz := date_trunc('minute', now());
  v_count int;
BEGIN
  -- Service role bypass (background workers can insert if ever needed; in practice they don't)
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Reject anonymous/unauthenticated enqueues
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'crm_sync_outbox: unauthenticated enqueue blocked';
  END IF;

  -- Stamp created_by if not set
  IF NEW.created_by IS NULL THEN
    NEW.created_by := v_uid;
  END IF;

  -- Pull configured per-user-per-minute limit
  SELECT value INTO v_settings FROM public.crm_settings WHERE key = 'push_limits';
  IF v_settings IS NOT NULL AND (v_settings ->> 'per_user_per_min') IS NOT NULL THEN
    v_limit := GREATEST(1, (v_settings ->> 'per_user_per_min')::int);
  END IF;

  -- Increment quota row, then check cap
  INSERT INTO public.crm_user_push_quota(user_id, window_start, count)
    VALUES (v_uid, v_window, 1)
    ON CONFLICT (user_id, window_start)
    DO UPDATE SET count = crm_user_push_quota.count + 1
    RETURNING count INTO v_count;

  IF v_count > v_limit THEN
    RAISE EXCEPTION 'crm_sync_outbox: rate limit exceeded (% per minute). Slow down or wait.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_crm_outbox ON public.crm_sync_outbox;
CREATE TRIGGER trg_guard_crm_outbox
  BEFORE INSERT ON public.crm_sync_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_crm_outbox_insert();

-- 5. Default settings rows (idempotent)
INSERT INTO public.crm_settings(key, value) VALUES
  ('push_limits', '{"max_per_tick":50,"max_per_hour":200,"max_per_day":1000,"burst_threshold":100,"per_user_per_min":30}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.crm_settings(key, value) VALUES
  ('sync_paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 6. Index to make quota lookups fast and allow cleanup of old windows
CREATE INDEX IF NOT EXISTS idx_crm_user_push_quota_window
  ON public.crm_user_push_quota(window_start);
