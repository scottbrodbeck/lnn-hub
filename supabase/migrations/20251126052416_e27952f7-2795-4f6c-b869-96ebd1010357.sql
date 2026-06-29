-- Add poll_data column to posts table
ALTER TABLE posts ADD COLUMN poll_data jsonb;