-- Add social_posts column to posts table
ALTER TABLE posts 
ADD COLUMN social_posts jsonb;

COMMENT ON COLUMN posts.social_posts IS 'Array of selected social media posts, max 2 items with structure: [{text: string, edited: boolean}]';