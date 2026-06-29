-- Phase 1: HubSpot two-way sync foundation

-- 1) Add sync metadata to existing CRM tables
ALTER TABLE public.crm_organizations
  ADD COLUMN IF NOT EXISTS hs_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hs_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_error text;

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS hs_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hs_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_error text;

ALTER TABLE public.crm_deals
  ADD COLUMN IF NOT EXISTS hs_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hs_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_error text;

ALTER TABLE public.crm_pipelines
  ADD COLUMN IF NOT EXISTS hubspot_id text,
  ADD COLUMN IF NOT EXISTS hs_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hs_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS hubspot_id text,
  ADD COLUMN IF NOT EXISTS hs_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hs_archived boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS crm_pipelines_hubspot_id_key ON public.crm_pipelines(hubspot_id) WHERE hubspot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_pipeline_stages_hubspot_id_key ON public.crm_pipeline_stages(hubspot_id) WHERE hubspot_id IS NOT NULL;

-- 2) Expand crm_activities to mirror HubSpot engagements (notes, emails, calls, meetings, tasks)
ALTER TABLE public.crm_activities
  ADD COLUMN IF NOT EXISTS hubspot_id text,
  ADD COLUMN IF NOT EXISTS engagement_type text,
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS body_text text,
  ADD COLUMN IF NOT EXISTS body_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS hs_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS hs_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hs_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS sync_error text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_activities_hubspot_id_key ON public.crm_activities(hubspot_id) WHERE hubspot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_activities_org_ts_idx ON public.crm_activities(crm_organization_id, hs_timestamp DESC) WHERE crm_organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_activities_deal_ts_idx ON public.crm_activities(deal_id, hs_timestamp DESC) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_activities_contact_ts_idx ON public.crm_activities(contact_id, hs_timestamp DESC) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_activities_body_cleanup_idx ON public.crm_activities(body_fetched_at) WHERE body_fetched_at IS NOT NULL;

-- 3) Per-user pipeline preference
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_crm_pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;

-- 4) HubSpot owner mirror with auto/manual mapping to local profiles
CREATE TABLE IF NOT EXISTS public.crm_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_owner_id text NOT NULL UNIQUE,
  email text,
  first_name text,
  last_name text,
  full_name text,
  archived boolean NOT NULL DEFAULT false,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_method text NOT NULL DEFAULT 'unmatched', -- 'email_auto' | 'manual' | 'unmatched'
  hs_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_owners_profile_idx ON public.crm_owners(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_owners_email_idx ON public.crm_owners(lower(email)) WHERE email IS NOT NULL;

ALTER TABLE public.crm_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM users can read owners"
  ON public.crm_owners FOR SELECT
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Admins manage owners"
  ON public.crm_owners FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER crm_owners_updated_at
  BEFORE UPDATE ON public.crm_owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Per-object incremental sync watermarks
CREATE TABLE IF NOT EXISTS public.crm_sync_state (
  object_type text PRIMARY KEY, -- 'companies' | 'contacts' | 'deals' | 'pipelines' | 'owners' | 'engagements_notes' | 'engagements_emails' | 'engagements_calls' | 'engagements_meetings' | 'engagements_tasks'
  last_modified_watermark timestamptz,
  last_full_reconcile_at timestamptz,
  last_run_at timestamptz,
  last_run_status text,
  last_error text,
  records_processed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM users can read sync state"
  ON public.crm_sync_state FOR SELECT
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Admins manage sync state"
  ON public.crm_sync_state FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER crm_sync_state_updated_at
  BEFORE UPDATE ON public.crm_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Outbox for app->HubSpot pushes
CREATE TABLE IF NOT EXISTS public.crm_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL, -- 'company' | 'contact' | 'deal' | 'note' | 'email' | 'call' | 'meeting' | 'task'
  entity_id uuid,           -- local row id (nullable for engagements that don't have a local row yet)
  hubspot_id text,          -- known HubSpot id for updates
  op text NOT NULL,         -- 'create' | 'update' | 'archive'
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  associations jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'in_flight' | 'applied' | 'error' | 'dead'
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  applied_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_sync_outbox_pending_idx
  ON public.crm_sync_outbox(next_attempt_at)
  WHERE status IN ('pending', 'error');
CREATE INDEX IF NOT EXISTS crm_sync_outbox_entity_idx
  ON public.crm_sync_outbox(entity_type, entity_id)
  WHERE status IN ('pending', 'in_flight', 'error');

ALTER TABLE public.crm_sync_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM users can read outbox"
  ON public.crm_sync_outbox FOR SELECT
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "CRM users can insert outbox"
  ON public.crm_sync_outbox FOR INSERT
  WITH CHECK (public.has_crm_access(auth.uid()));

CREATE POLICY "Admins manage outbox"
  ON public.crm_sync_outbox FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER crm_sync_outbox_updated_at
  BEFORE UPDATE ON public.crm_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Sync log (audit trail)
CREATE TABLE IF NOT EXISTS public.crm_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL, -- 'pull' | 'push'
  entity_type text NOT NULL,
  op text,
  status text NOT NULL, -- 'ok' | 'error' | 'partial'
  records_processed integer,
  latency_ms integer,
  error text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_sync_log_created_idx ON public.crm_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS crm_sync_log_entity_idx ON public.crm_sync_log(entity_type, created_at DESC);

ALTER TABLE public.crm_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM users can read sync log"
  ON public.crm_sync_log FOR SELECT
  USING (public.has_crm_access(auth.uid()));

CREATE POLICY "Admins manage sync log"
  ON public.crm_sync_log FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));