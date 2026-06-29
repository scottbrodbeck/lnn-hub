-- Create admin settings table for webhook configuration
CREATE TABLE admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage settings" ON admin_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default webhook settings
INSERT INTO admin_settings (key, value, description) VALUES
  ('zapier_webhook_url', '""'::jsonb, 'Zapier webhook endpoint URL for admin notifications'),
  ('webhook_enabled', 'true'::jsonb, 'Enable/disable webhook notifications');

-- Trigger for updated_at
CREATE TRIGGER update_admin_settings_updated_at
  BEFORE UPDATE ON admin_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();