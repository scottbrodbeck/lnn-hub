-- Gate stage-history trigger so inbound HubSpot syncs don't pollute history
CREATE OR REPLACE FUNCTION public.record_crm_deal_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip when an inbound sync is in progress
  IF current_setting('crm.sync_in_progress', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.crm_deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.id, OLD.stage_id, NEW.stage_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Seed a sync_paused setting (default false)
INSERT INTO public.crm_settings (key, value)
VALUES ('sync_paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Ensure crm_owners.hubspot_owner_id is unique for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_owners'::regclass
      AND conname = 'crm_owners_hubspot_owner_id_key'
  ) THEN
    ALTER TABLE public.crm_owners
      ADD CONSTRAINT crm_owners_hubspot_owner_id_key UNIQUE (hubspot_owner_id);
  END IF;
END $$;