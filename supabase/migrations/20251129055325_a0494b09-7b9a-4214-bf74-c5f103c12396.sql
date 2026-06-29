-- Add logo author name column to posts and column_templates tables
ALTER TABLE posts ADD COLUMN logo_author_name TEXT;
ALTER TABLE column_templates ADD COLUMN logo_author_name TEXT;
ALTER TABLE profiles ADD COLUMN default_logo_author_name TEXT;