-- Create table to track WordPress media uploads and prevent duplicates
CREATE TABLE wordpress_media_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  supabase_image_url text NOT NULL,
  wordpress_media_id integer NOT NULL,
  wordpress_media_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  UNIQUE(site_id, supabase_image_url)
);

-- Index for fast lookups when checking if image exists
CREATE INDEX idx_wordpress_media_site_url ON wordpress_media_mappings(site_id, supabase_image_url);

-- Add column to posts to track which media IDs were used
ALTER TABLE posts ADD COLUMN wordpress_media_ids jsonb;

-- Enable RLS
ALTER TABLE wordpress_media_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage media mappings" ON wordpress_media_mappings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_wordpress_media_mappings_updated_at
  BEFORE UPDATE ON wordpress_media_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();