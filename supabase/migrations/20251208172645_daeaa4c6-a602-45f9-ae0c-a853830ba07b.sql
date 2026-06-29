-- Add animated_featured_image column to posts table
ALTER TABLE public.posts 
ADD COLUMN animated_featured_image JSONB DEFAULT NULL;

-- Comment explaining the structure
COMMENT ON COLUMN public.posts.animated_featured_image IS 'Structure: { url: string, fileSize: number, isAnimated: boolean }';