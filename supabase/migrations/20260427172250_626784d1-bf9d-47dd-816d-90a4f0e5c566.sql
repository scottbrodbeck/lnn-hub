-- Replace partial unique indexes on hubspot_id with full UNIQUE constraints
-- so that PostgREST upserts using ON CONFLICT (hubspot_id) work correctly.
-- Partial indexes (WHERE hubspot_id IS NOT NULL) are not matched by ON CONFLICT
-- without an explicit WHERE clause, which supabase-js does not emit.

-- crm_organizations
DROP INDEX IF EXISTS public.crm_organizations_hubspot_id_uniq;
DROP INDEX IF EXISTS public.crm_organizations_hubspot_id_key;
ALTER TABLE public.crm_organizations
  ADD CONSTRAINT crm_organizations_hubspot_id_key UNIQUE (hubspot_id);

-- crm_contacts
DROP INDEX IF EXISTS public.crm_contacts_hubspot_id_uniq;
DROP INDEX IF EXISTS public.crm_contacts_hubspot_id_key;
ALTER TABLE public.crm_contacts
  ADD CONSTRAINT crm_contacts_hubspot_id_key UNIQUE (hubspot_id);

-- crm_deals
DROP INDEX IF EXISTS public.crm_deals_hubspot_id_uniq;
DROP INDEX IF EXISTS public.crm_deals_hubspot_id_key;
ALTER TABLE public.crm_deals
  ADD CONSTRAINT crm_deals_hubspot_id_key UNIQUE (hubspot_id);

-- crm_activities
DROP INDEX IF EXISTS public.crm_activities_hubspot_id_key;
ALTER TABLE public.crm_activities
  ADD CONSTRAINT crm_activities_hubspot_id_key UNIQUE (hubspot_id);