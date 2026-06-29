-- Add caption column to image_uploads table
ALTER TABLE public.image_uploads 
ADD COLUMN IF NOT EXISTS caption text;

-- Add RLS policy to allow public to update image captions
CREATE POLICY "Public can update image captions"
ON public.image_uploads
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Add RLS policy to allow public to delete images
CREATE POLICY "Public can delete images"
ON public.image_uploads
FOR DELETE
USING (true);