ALTER TABLE public.post_assignments
ADD COLUMN email_notifications_enabled boolean NOT NULL DEFAULT true;