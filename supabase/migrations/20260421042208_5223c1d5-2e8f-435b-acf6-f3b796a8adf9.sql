
-- Add tracking columns to existing CRM tables
ALTER TABLE public.crm_organizations
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS hubspot_id text;

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS hubspot_id text;

ALTER TABLE public.crm_deals
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS hubspot_id text;

ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS hubspot_id text;

-- Partial unique indexes on hubspot_id (only enforced when not null)
CREATE UNIQUE INDEX IF NOT EXISTS crm_organizations_hubspot_id_uniq
  ON public.crm_organizations (hubspot_id) WHERE hubspot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_hubspot_id_uniq
  ON public.crm_contacts (hubspot_id) WHERE hubspot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_deals_hubspot_id_uniq
  ON public.crm_deals (hubspot_id) WHERE hubspot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_products_hubspot_id_uniq
  ON public.crm_products (hubspot_id) WHERE hubspot_id IS NOT NULL;

-- Indexes for fast batch-based lookups (undo path)
CREATE INDEX IF NOT EXISTS crm_organizations_import_batch_id_idx
  ON public.crm_organizations (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_import_batch_id_idx
  ON public.crm_contacts (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_deals_import_batch_id_idx
  ON public.crm_deals (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_products_import_batch_id_idx
  ON public.crm_products (import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Import batches table
CREATE TABLE IF NOT EXISTS public.crm_import_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL DEFAULT 'hubspot',
  status          text NOT NULL DEFAULT 'previewing',
  counts          jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  field_mapping   jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_mapping   jsonb NOT NULL DEFAULT '{}'::jsonb,
  pipeline_id     uuid,
  stage_mapping   jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message   text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  undone_at       timestamptz
);

ALTER TABLE public.crm_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage import batches"
  ON public.crm_import_batches FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Staging table
CREATE TABLE IF NOT EXISTS public.crm_import_staging (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL REFERENCES public.crm_import_batches(id) ON DELETE CASCADE,
  entity_type     text NOT NULL,
  hubspot_id      text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  associations    jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_type      text NOT NULL DEFAULT 'create',
  match_target_id uuid,
  errors          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_import_staging_batch_idx
  ON public.crm_import_staging (batch_id, entity_type);

ALTER TABLE public.crm_import_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage import staging"
  ON public.crm_import_staging FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
