-- Add WordPress tracking columns to posts table
ALTER TABLE posts 
ADD COLUMN wordpress_post_id integer NULL,
ADD COLUMN wordpress_post_url text NULL;