-- Add logo link URL columns to tables
ALTER TABLE profiles ADD COLUMN default_logo_link_url TEXT;
ALTER TABLE posts ADD COLUMN logo_link_url TEXT;
ALTER TABLE column_templates ADD COLUMN logo_link_url TEXT;