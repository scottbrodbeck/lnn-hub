ALTER TABLE public.wordpress_media_mappings
ADD COLUMN image_upload_id uuid;

ALTER TABLE public.wordpress_media_mappings
ADD CONSTRAINT wordpress_media_mappings_image_upload_id_fkey
FOREIGN KEY (image_upload_id)
REFERENCES public.image_uploads(id)
ON DELETE SET NULL;

CREATE INDEX idx_wordpress_media_mappings_image_upload_id
ON public.wordpress_media_mappings (image_upload_id);

CREATE UNIQUE INDEX wordpress_media_mappings_site_image_upload_unique
ON public.wordpress_media_mappings (site_id, image_upload_id)
WHERE image_upload_id IS NOT NULL;

ALTER TABLE public.posts
ADD COLUMN featured_image_id uuid;

ALTER TABLE public.posts
ADD CONSTRAINT posts_featured_image_id_fkey
FOREIGN KEY (featured_image_id)
REFERENCES public.image_uploads(id)
ON DELETE SET NULL;

CREATE INDEX idx_posts_featured_image_id
ON public.posts (featured_image_id);