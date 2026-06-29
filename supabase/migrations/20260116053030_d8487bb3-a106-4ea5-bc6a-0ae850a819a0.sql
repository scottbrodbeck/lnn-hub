-- Add 'archived' to the post_status enum if not exists
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'archived';