ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS wordpress_site_id uuid;

CREATE INDEX IF NOT EXISTS idx_posts_wordpress_site_id
ON public.posts (wordpress_site_id)
WHERE wordpress_site_id IS NOT NULL;