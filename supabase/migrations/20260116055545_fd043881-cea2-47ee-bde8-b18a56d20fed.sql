-- Add content_category column to post_assignments for high-level content categorization
ALTER TABLE post_assignments 
ADD COLUMN content_category TEXT NOT NULL DEFAULT 'website';

-- Add check constraint to enforce valid values
ALTER TABLE post_assignments 
ADD CONSTRAINT content_category_check 
CHECK (content_category IN ('website', 'email', 'sponsorship'));

-- Add index for efficient filtering by content category
CREATE INDEX idx_post_assignments_content_category 
ON post_assignments(content_category);

-- Add metadata JSONB column to posts for flexible content-specific attributes
ALTER TABLE posts 
ADD COLUMN metadata JSONB DEFAULT '{}';

-- Add GIN index for efficient JSONB queries on metadata
CREATE INDEX idx_posts_metadata 
ON posts USING GIN (metadata);