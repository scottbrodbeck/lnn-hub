-- Bundle composition table
CREATE TABLE public.crm_product_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_product_id uuid NOT NULL REFERENCES public.crm_products(id) ON DELETE CASCADE,
  assignment_kind text NOT NULL,
  content_category text,
  post_type text,
  quantity integer NOT NULL DEFAULT 1,
  cadence text NOT NULL DEFAULT 'weekly',
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_product_bundle_items_bundle ON public.crm_product_bundle_items(bundle_product_id, sort_order);

ALTER TABLE public.crm_product_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bundle items"
  ON public.crm_product_bundle_items
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "CRM users can read bundle items"
  ON public.crm_product_bundle_items
  FOR SELECT
  USING (has_crm_access(auth.uid()));

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_bundle_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignment_kind NOT IN ('post', 'display_ad') THEN
    RAISE EXCEPTION 'assignment_kind must be post or display_ad';
  END IF;
  IF NEW.assignment_kind = 'post' THEN
    IF NEW.content_category IS NULL OR NEW.content_category NOT IN ('website','email_blast','email_sponsorship') THEN
      RAISE EXCEPTION 'content_category required for post items (website|email_blast|email_sponsorship)';
    END IF;
    IF NEW.post_type IS NULL THEN
      RAISE EXCEPTION 'post_type required for post items';
    END IF;
  END IF;
  IF NEW.cadence NOT IN ('none','weekly','biweekly','monthly') THEN
    RAISE EXCEPTION 'cadence must be none, weekly, biweekly, or monthly';
  END IF;
  IF NEW.quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_bundle_item
  BEFORE INSERT OR UPDATE ON public.crm_product_bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_bundle_item();

CREATE TRIGGER trg_bundle_items_updated_at
  BEFORE UPDATE ON public.crm_product_bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();