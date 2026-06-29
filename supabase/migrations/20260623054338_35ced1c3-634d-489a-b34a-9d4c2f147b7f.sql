ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stat_email_suppress text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.organizations.stat_email_suppress IS
  'Emails always excluded from sponsored-post stat emails (client-lookup stat_contacts), independent of membership/prefs.';