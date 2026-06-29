-- Add new status to post_status enum for pending edit reviews
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'pending_edit_review';

-- Create table to track edit requests
CREATE TABLE post_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  
  -- What changed
  old_headline text,
  new_headline text,
  old_content text,
  new_content text,
  old_author_name text,
  new_author_name text,
  old_featured_image_url text,
  new_featured_image_url text,
  old_gallery_images jsonb,
  new_gallery_images jsonb,
  old_youtube_url text,
  new_youtube_url text,
  
  -- Tracking
  requested_by uuid NOT NULL REFERENCES profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_reason text,
  
  -- Review
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  
  -- WordPress sync
  wordpress_updated boolean DEFAULT false,
  wordpress_update_error text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_post_edit_requests_post ON post_edit_requests(post_id);
CREATE INDEX idx_post_edit_requests_status ON post_edit_requests(status);
CREATE INDEX idx_post_edit_requests_requested_by ON post_edit_requests(requested_by);

-- Enable RLS
ALTER TABLE post_edit_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Clients can create edit requests" ON post_edit_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid() AND 
    has_role(auth.uid(), 'client'::app_role)
  );

CREATE POLICY "Clients can view own edit requests" ON post_edit_requests
  FOR SELECT USING (
    requested_by = auth.uid() AND 
    has_role(auth.uid(), 'client'::app_role)
  );

CREATE POLICY "Admins can manage edit requests" ON post_edit_requests
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_post_edit_requests_updated_at
  BEFORE UPDATE ON post_edit_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();