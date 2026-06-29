-- Create email notification logs table
CREATE TABLE public.email_notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notification_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.email_notification_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to view all logs
CREATE POLICY "Admins can view all notification logs"
  ON public.email_notification_logs
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_email_notification_logs_sent_at ON public.email_notification_logs(sent_at DESC);
CREATE INDEX idx_email_notification_logs_user_id ON public.email_notification_logs(user_id);
CREATE INDEX idx_email_notification_logs_status ON public.email_notification_logs(status);