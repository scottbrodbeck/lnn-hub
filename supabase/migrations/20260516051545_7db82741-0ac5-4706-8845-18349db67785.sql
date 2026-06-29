ALTER TABLE public.qbo_auth_state
  ADD COLUMN IF NOT EXISTS oauth_state text,
  ADD COLUMN IF NOT EXISTS oauth_state_expires_at timestamptz;