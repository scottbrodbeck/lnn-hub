-- Add CTA button fields to posts table
ALTER TABLE posts
ADD COLUMN cta_button_text text,
ADD COLUMN cta_button_url text;

COMMENT ON COLUMN posts.cta_button_text IS 'Optional call-to-action button text (max 20 characters)';
COMMENT ON COLUMN posts.cta_button_url IS 'Optional call-to-action button click-through URL';