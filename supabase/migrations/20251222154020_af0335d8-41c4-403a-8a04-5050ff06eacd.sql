-- Add thumbnail_url column to image_uploads table
ALTER TABLE public.image_uploads ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;