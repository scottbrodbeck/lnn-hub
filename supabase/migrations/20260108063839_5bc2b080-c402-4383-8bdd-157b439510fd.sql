-- Add byline column to posts table
ALTER TABLE posts ADD COLUMN byline TEXT;

-- Add default_byline column to profiles table
ALTER TABLE profiles ADD COLUMN default_byline TEXT;