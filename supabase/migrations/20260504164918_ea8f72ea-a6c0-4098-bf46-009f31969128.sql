-- 1. Add column
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_organization_id ON public.posts(organization_id);

-- 2. Backfill from post_assignments where possible (one assignment per post is typical)
UPDATE public.posts p
SET organization_id = pa.organization_id
FROM public.post_assignments pa
WHERE p.organization_id IS NULL
  AND pa.organization_id IS NOT NULL
  AND pa.id = ANY(p.assignment_ids);

-- 3. Defense-in-depth RLS: replace client SELECT/UPDATE/DELETE policies to also require org membership
DROP POLICY IF EXISTS "Clients can view own posts" ON public.posts;
DROP POLICY IF EXISTS "Clients can update own posts" ON public.posts;
DROP POLICY IF EXISTS "Clients can delete own posts" ON public.posts;

CREATE POLICY "Clients can view own org posts"
  ON public.posts FOR SELECT
  USING (
    has_role(auth.uid(), 'client'::app_role)
    AND client_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Clients can update own org posts"
  ON public.posts FOR UPDATE
  USING (
    has_role(auth.uid(), 'client'::app_role)
    AND client_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Clients can delete own org posts"
  ON public.posts FOR DELETE
  USING (
    has_role(auth.uid(), 'client'::app_role)
    AND client_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
      )
    )
  );