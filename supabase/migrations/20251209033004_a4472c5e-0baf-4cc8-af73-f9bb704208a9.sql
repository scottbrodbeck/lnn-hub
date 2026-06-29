-- Add processing status columns to image_uploads table
ALTER TABLE public.image_uploads 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ready' CHECK (status IN ('uploading', 'processing', 'ready')),
ADD COLUMN IF NOT EXISTS is_optimized BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_size INTEGER,
ADD COLUMN IF NOT EXISTS optimized_size INTEGER,
ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- Update existing records to have ready status
UPDATE public.image_uploads SET status = 'ready' WHERE status IS NULL;