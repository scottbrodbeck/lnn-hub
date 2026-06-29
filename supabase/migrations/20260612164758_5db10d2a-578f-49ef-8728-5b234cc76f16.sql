ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS mailchimp_config JSONB DEFAULT '{}';

COMMENT ON COLUMN public.sites.mailchimp_config IS
  'Mailchimp integration: {api_key, audience_id, saved_segment_id (int), from_name, reply_to, template_id (int, auto-created on first use), banner_image_url}';

ALTER TABLE public.email_blasts
  ADD COLUMN IF NOT EXISTS mailchimp_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS mailchimp_web_id BIGINT,
  ADD COLUMN IF NOT EXISTS mailchimp_campaign_url TEXT;

DROP VIEW IF EXISTS public.sites_public;
CREATE VIEW public.sites_public
WITH (security_invoker = true) AS
SELECT
  id,
  name,
  url,
  is_active,
  created_at,
  updated_at,
  CASE
    WHEN beehiiv_config->>'api_key' IS NOT NULL
     AND beehiiv_config->>'publication_id' IS NOT NULL THEN 'beehiiv'
    WHEN mailchimp_config->>'api_key' IS NOT NULL
     AND mailchimp_config->>'audience_id' IS NOT NULL THEN 'mailchimp'
    ELSE 'none'
  END AS email_platform
FROM public.sites;

GRANT SELECT ON public.sites_public TO authenticated;
GRANT SELECT ON public.sites_public TO anon;