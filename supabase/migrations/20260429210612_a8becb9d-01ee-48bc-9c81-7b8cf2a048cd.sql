-- Replace last-activity rollup so it ignores future-dated tasks and import timestamps.
-- "Last activity" should be the most recent activity that has actually happened (<= now()).
CREATE OR REPLACE FUNCTION public.recompute_crm_org_last_activity(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
BEGIN
  IF _org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT MAX(
    CASE
      WHEN completed_at IS NOT NULL AND completed_at <= now() THEN completed_at
      WHEN hs_timestamp IS NOT NULL AND hs_timestamp <= now() THEN hs_timestamp
      WHEN due_at IS NOT NULL AND due_at <= now() THEN due_at
      WHEN completed_at IS NULL AND hs_timestamp IS NULL AND due_at IS NULL
           AND created_at <= now() THEN created_at
      ELSE NULL
    END
  )
  INTO v_last
  FROM public.crm_activities
  WHERE crm_organization_id = _org_id;

  UPDATE public.crm_organizations
     SET last_activity_at = v_last
   WHERE id = _org_id
     AND last_activity_at IS DISTINCT FROM v_last;
END;
$$;

-- Backfill all organizations using the corrected logic.
WITH proposed AS (
  SELECT crm_organization_id,
         MAX(
           CASE
             WHEN completed_at IS NOT NULL AND completed_at <= now() THEN completed_at
             WHEN hs_timestamp IS NOT NULL AND hs_timestamp <= now() THEN hs_timestamp
             WHEN due_at IS NOT NULL AND due_at <= now() THEN due_at
             WHEN completed_at IS NULL AND hs_timestamp IS NULL AND due_at IS NULL
                  AND created_at <= now() THEN created_at
             ELSE NULL
           END
         ) AS last_at
    FROM public.crm_activities
   WHERE crm_organization_id IS NOT NULL
   GROUP BY crm_organization_id
)
UPDATE public.crm_organizations o
   SET last_activity_at = p.last_at
  FROM proposed p
 WHERE o.id = p.crm_organization_id
   AND o.last_activity_at IS DISTINCT FROM p.last_at;

-- Orgs with no qualifying past activity should have NULL.
UPDATE public.crm_organizations o
   SET last_activity_at = NULL
 WHERE last_activity_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.crm_activities a
      WHERE a.crm_organization_id = o.id
        AND (
          (a.completed_at IS NOT NULL AND a.completed_at <= now())
          OR (a.hs_timestamp IS NOT NULL AND a.hs_timestamp <= now())
          OR (a.due_at IS NOT NULL AND a.due_at <= now())
          OR (a.completed_at IS NULL AND a.hs_timestamp IS NULL AND a.due_at IS NULL
              AND a.created_at <= now())
        )
   );