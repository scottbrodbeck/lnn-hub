-- Add comments_enabled column to posts table
ALTER TABLE public.posts 
ADD COLUMN comments_enabled boolean NOT NULL DEFAULT false;

-- Add default_comments_enabled column to user_notification_preferences table
ALTER TABLE public.user_notification_preferences 
ADD COLUMN default_comments_enabled boolean NOT NULL DEFAULT false;