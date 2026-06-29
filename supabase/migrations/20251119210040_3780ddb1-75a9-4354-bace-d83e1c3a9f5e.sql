-- Create the editor-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'editor-images',
  'editor-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
);

-- RLS Policies for the editor-images bucket
CREATE POLICY "Public can upload images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'editor-images');

CREATE POLICY "Public can view images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'editor-images');

CREATE POLICY "Public can delete images"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'editor-images');