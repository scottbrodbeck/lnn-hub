-- Create api_logs table for WordPress API interactions
CREATE TABLE public.api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  log_type TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  request_data JSONB,
  response_data JSONB,
  error_message TEXT,
  post_id UUID REFERENCES public.posts(id),
  site_id UUID REFERENCES public.sites(id)
);

-- Enable RLS
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all API logs
CREATE POLICY "Admins can view all API logs"
ON public.api_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_api_logs_created_at ON public.api_logs(created_at DESC);
CREATE INDEX idx_api_logs_log_type ON public.api_logs(log_type);
CREATE INDEX idx_api_logs_status ON public.api_logs(status);