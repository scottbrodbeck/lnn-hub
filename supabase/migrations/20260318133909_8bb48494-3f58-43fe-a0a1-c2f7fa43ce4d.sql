DROP FUNCTION IF EXISTS public.get_my_default_sponsor();
DROP FUNCTION IF EXISTS public.set_my_default_sponsor(uuid);

CREATE OR REPLACE FUNCTION public.get_my_default_sponsor(_organization_id uuid DEFAULT NULL)
RETURNS TABLE (
  sponsor_id uuid,
  organization_id uuid,
  name text,
  logo_url text,
  link_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_org AS (
    SELECT uo.organization_id
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND (_organization_id IS NULL OR uo.organization_id = _organization_id)
    ORDER BY uo.is_primary DESC, uo.created_at ASC
    LIMIT 1
  )
  SELECT s.id, s.organization_id, s.name, s.logo_url, s.link_url
  FROM target_org t
  JOIN public.organizations o ON o.id = t.organization_id
  LEFT JOIN public.sponsors s ON s.id = o.default_sponsor_id AND s.is_active = true
$$;

CREATE OR REPLACE FUNCTION public.set_my_default_sponsor(_organization_id uuid, _sponsor_id uuid)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated_org public.organizations;
BEGIN
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'You do not have access to this organization';
  END IF;

  IF _sponsor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sponsors s
    WHERE s.id = _sponsor_id
      AND s.organization_id = _organization_id
      AND s.is_active = true
  ) THEN
    RAISE EXCEPTION 'Selected sponsor does not belong to your organization';
  END IF;

  UPDATE public.organizations o
  SET default_sponsor_id = _sponsor_id,
      updated_at = now()
  WHERE o.id = _organization_id
  RETURNING o.* INTO _updated_org;

  RETURN _updated_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_default_sponsor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_default_sponsor(uuid, uuid) TO authenticated;