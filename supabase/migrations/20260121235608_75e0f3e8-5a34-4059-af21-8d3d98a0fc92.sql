-- Create support_requests table for client help requests
CREATE TABLE public.support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'closed')),
  description TEXT NOT NULL,
  screenshot_urls JSONB DEFAULT '[]',
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  page_url TEXT,
  user_agent TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

-- Clients can create support requests
CREATE POLICY "Clients can create support requests"
  ON public.support_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'client'::app_role));

-- Clients can view their own requests
CREATE POLICY "Clients can view own support requests"
  ON public.support_requests FOR SELECT
  USING (auth.uid() = user_id AND has_role(auth.uid(), 'client'::app_role));

-- Admins can manage all requests
CREATE POLICY "Admins can manage all support requests"
  ON public.support_requests FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes for efficient queries
CREATE INDEX idx_support_requests_status ON public.support_requests(status);
CREATE INDEX idx_support_requests_user_id ON public.support_requests(user_id);
CREATE INDEX idx_support_requests_created_at ON public.support_requests(created_at DESC);

-- Add updated_at trigger
CREATE TRIGGER update_support_requests_updated_at
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();