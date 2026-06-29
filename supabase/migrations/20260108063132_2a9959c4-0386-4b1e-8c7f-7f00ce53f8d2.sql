-- Add author bio fields to profiles table for user defaults
ALTER TABLE profiles ADD COLUMN default_author_bio TEXT;
ALTER TABLE profiles ADD COLUMN default_author_photo_url TEXT;

-- Add author bio fields to posts table for post-specific data
ALTER TABLE posts ADD COLUMN author_bio TEXT;
ALTER TABLE posts ADD COLUMN author_photo_url TEXT;