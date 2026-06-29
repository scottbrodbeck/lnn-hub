-- Add unique constraints on hubspot_id so upsert(onConflict: "hubspot_id") works.
-- Use partial unique indexes so multiple rows with NULL hubspot_id (local-only records) remain allowed.

CREATE UNIQUE INDEX IF NOT EXISTS crm_organizations_hubspot_id_key
  ON public.crm_organizations (hubspot_id)
  WHERE hubspot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_hubspot_id_key
  ON public.crm_contacts (hubspot_id)
  WHERE hubspot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_deals_hubspot_id_key
  ON public.crm_deals (hubspot_id)
  WHERE hubspot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_activities_hubspot_id_key
  ON public.crm_activities (hubspot_id)
  WHERE hubspot_id IS NOT NULL;