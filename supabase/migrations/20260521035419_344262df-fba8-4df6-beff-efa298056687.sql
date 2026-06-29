ALTER TABLE public.post_edit_requests
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_post_edit_requests_awaiting_ack
  ON public.post_edit_requests (status, acknowledged_at)
  WHERE status = 'approved' AND acknowledged_at IS NULL;