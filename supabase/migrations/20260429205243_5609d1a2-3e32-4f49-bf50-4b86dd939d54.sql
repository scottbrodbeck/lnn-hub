-- 1. Column + index
ALTER TABLE public.crm_organizations
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_organizations_last_activity_at
  ON public.crm_organizations (last_activity_at DESC NULLS LAST);

-- 2. Recompute helper: sets last_activity_at for one org from crm_activities
CREATE OR REPLACE FUNCTION public.recompute_crm_org_last_activity(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _org_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.crm_organizations o
     SET last_activity_at = sub.last_at
    FROM (
      SELECT MAX(GREATEST(
               COALESCE(completed_at, '-infinity'::timestamptz),
               COALESCE(hs_timestamp, '-infinity'::timestamptz),
               created_at
             )) AS last_at
        FROM public.crm_activities
       WHERE crm_organization_id = _org_id
    ) sub
   WHERE o.id = _org_id
     AND o.last_activity_at IS DISTINCT FROM
         CASE WHEN sub.last_at = '-infinity'::timestamptz THEN NULL ELSE sub.last_at END;

  -- If no activities remain, ensure column is NULL
  UPDATE public.crm_organizations
     SET last_activity_at = NULL
   WHERE id = _org_id
     AND NOT EXISTS (
       SELECT 1 FROM public.crm_activities WHERE crm_organization_id = _org_id
     )
     AND last_activity_at IS NOT NULL;
END;
$$;

-- 3. Trigger function: handles INSERT/UPDATE/DELETE on crm_activities
CREATE OR REPLACE FUNCTION public.trg_crm_activities_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_crm_org_last_activity(OLD.crm_organization_id);
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE
  PERFORM public.recompute_crm_org_last_activity(NEW.crm_organization_id);

  -- If the org link moved, also recompute the previous org
  IF TG_OP = 'UPDATE'
     AND OLD.crm_organization_id IS DISTINCT FROM NEW.crm_organization_id THEN
    PERFORM public.recompute_crm_org_last_activity(OLD.crm_organization_id);
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger
DROP TRIGGER IF EXISTS crm_activities_last_activity_aiud ON public.crm_activities;
CREATE TRIGGER crm_activities_last_activity_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.crm_activities
FOR EACH ROW EXECUTE FUNCTION public.trg_crm_activities_last_activity();

-- 5. Backfill from existing activities
UPDATE public.crm_organizations o
   SET last_activity_at = sub.last_at
  FROM (
    SELECT crm_organization_id,
           MAX(GREATEST(
             COALESCE(completed_at, '-infinity'::timestamptz),
             COALESCE(hs_timestamp, '-infinity'::timestamptz),
             created_at
           )) AS last_at
      FROM public.crm_activities
     WHERE crm_organization_id IS NOT NULL
     GROUP BY crm_organization_id
  ) sub
 WHERE o.id = sub.crm_organization_id;