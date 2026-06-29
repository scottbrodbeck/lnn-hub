ALTER TABLE public.post_edit_requests
  ADD COLUMN IF NOT EXISTS old_featured_image_id uuid,
  ADD COLUMN IF NOT EXISTS new_featured_image_id uuid;