ALTER TABLE public.image_uploads
ADD COLUMN IF NOT EXISTS organization_id uuid,
ADD COLUMN IF NOT EXISTS uploaded_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'image_uploads'
      AND constraint_name = 'image_uploads_organization_id_fkey'
  ) THEN
    ALTER TABLE public.image_uploads
      ADD CONSTRAINT image_uploads_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'image_uploads'
      AND constraint_name = 'image_uploads_uploaded_by_fkey'
  ) THEN
    ALTER TABLE public.image_uploads
      ADD CONSTRAINT image_uploads_uploaded_by_fkey
      FOREIGN KEY (uploaded_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_image_uploads_organization_uploaded_at
  ON public.image_uploads (organization_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_uploads_uploaded_by
  ON public.image_uploads (uploaded_by);

DROP POLICY IF EXISTS "Authenticated users can view images" ON public.image_uploads;
DROP POLICY IF EXISTS "Authenticated users can insert images" ON public.image_uploads;
DROP POLICY IF EXISTS "Authenticated users can update images" ON public.image_uploads;
DROP POLICY IF EXISTS "Authenticated users can delete images" ON public.image_uploads;

CREATE POLICY "Admins can manage all images"
ON public.image_uploads
FOR ALL
TO public
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view org images"
ON public.image_uploads
FOR SELECT
TO public
USING (
  public.has_role(auth.uid(), 'client')
  AND organization_id IN (
    SELECT uo.organization_id
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can insert org images"
ON public.image_uploads
FOR INSERT
TO public
WITH CHECK (
  public.has_role(auth.uid(), 'client')
  AND uploaded_by = auth.uid()
  AND organization_id IN (
    SELECT uo.organization_id
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can update org images"
ON public.image_uploads
FOR UPDATE
TO public
USING (
  public.has_role(auth.uid(), 'client')
  AND organization_id IN (
    SELECT uo.organization_id
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'client')
  AND organization_id IN (
    SELECT uo.organization_id
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can delete org images"
ON public.image_uploads
FOR DELETE
TO public
USING (
  public.has_role(auth.uid(), 'client')
  AND organization_id IN (
    SELECT uo.organization_id
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
  )
);