ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS default_sponsor_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_default_sponsor_id_fkey'
  ) THEN
    ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_default_sponsor_id_fkey
    FOREIGN KEY (default_sponsor_id)
    REFERENCES public.sponsors(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_default_sponsor_id
ON public.organizations(default_sponsor_id);

CREATE OR REPLACE FUNCTION public.get_my_default_sponsor()
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
  SELECT s.id, s.organization_id, s.name, s.logo_url, s.link_url
  FROM public.user_organizations uo
  JOIN public.organizations o ON o.id = uo.organization_id
  LEFT JOIN public.sponsors s ON s.id = o.default_sponsor_id AND s.is_active = true
  WHERE uo.user_id = auth.uid()
    AND uo.is_primary = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.set_my_default_sponsor(_sponsor_id uuid)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _organization_id uuid;
  _updated_org public.organizations;
BEGIN
  SELECT organization_id
  INTO _organization_id
  FROM public.user_organizations
  WHERE user_id = auth.uid()
  ORDER BY is_primary DESC, created_at ASC
  LIMIT 1;

  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'No organization membership found for current user';
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

GRANT EXECUTE ON FUNCTION public.get_my_default_sponsor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_default_sponsor(uuid) TO authenticated;