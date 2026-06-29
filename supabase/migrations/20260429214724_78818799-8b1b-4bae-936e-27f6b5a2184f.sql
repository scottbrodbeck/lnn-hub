
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone
);

CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api keys"
  ON public.api_keys
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.api_key_usage_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  client_code text,
  status_code integer NOT NULL,
  ip text,
  user_agent text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_key_usage_log_created_at ON public.api_key_usage_log(created_at DESC);
CREATE INDEX idx_api_key_usage_log_api_key_id ON public.api_key_usage_log(api_key_id);

ALTER TABLE public.api_key_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view api key usage log"
  ON public.api_key_usage_log
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
