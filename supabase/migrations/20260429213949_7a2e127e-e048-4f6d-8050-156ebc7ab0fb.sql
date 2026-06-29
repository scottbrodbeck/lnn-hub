ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS exclude_from_creative_emails boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_from_stat_emails boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Admins manage all notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Admins manage all notification preferences"
  ON public.user_notification_preferences
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));