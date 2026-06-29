CREATE TABLE public.wordpress_author_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  wordpress_author_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_id)
);

ALTER TABLE public.wordpress_author_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage author mappings"
  ON public.wordpress_author_mappings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));