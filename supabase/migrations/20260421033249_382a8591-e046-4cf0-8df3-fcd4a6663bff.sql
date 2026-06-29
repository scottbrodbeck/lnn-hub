-- 1. Add 'sales' to app_role enum (additive, safe)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales';

-- 2. Enums for CRM
DO $$ BEGIN
  CREATE TYPE public.crm_billing_cycle AS ENUM ('one_time', 'monthly', 'quarterly', 'annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_deal_status AS ENUM ('open', 'won', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crm_activity_type AS ENUM ('call', 'meeting', 'task', 'email', 'note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Helper: has CRM access (sales OR admin OR super_admin)
CREATE OR REPLACE FUNCTION public.has_crm_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('sales', 'admin', 'super_admin')
  );
$$;

-- 4. crm_pipelines
CREATE TABLE public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage pipelines" ON public.crm_pipelines
  FOR ALL USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));
CREATE TRIGGER trg_crm_pipelines_updated BEFORE UPDATE ON public.crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. crm_pipeline_stages
CREATE TABLE public.crm_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  win_probability numeric(5,2) NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_stages_pipeline ON public.crm_pipeline_stages(pipeline_id, sort_order);
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage stages" ON public.crm_pipeline_stages
  FOR ALL USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));
CREATE TRIGGER trg_crm_stages_updated BEFORE UPDATE ON public.crm_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. crm_organizations
CREATE TABLE public.crm_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  industry text,
  size text,
  address text,
  phone text,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  source text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_orgs_linked ON public.crm_organizations(linked_org_id);
CREATE INDEX idx_crm_orgs_owner ON public.crm_organizations(owner_user_id);
ALTER TABLE public.crm_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage organizations" ON public.crm_organizations
  FOR ALL USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));
CREATE TRIGGER trg_crm_orgs_updated BEFORE UPDATE ON public.crm_organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. crm_contacts
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_organization_id uuid REFERENCES public.crm_organizations(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email text,
  phone text,
  title text,
  is_primary boolean NOT NULL DEFAULT false,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_contacts_org ON public.crm_contacts(crm_organization_id);
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage contacts" ON public.crm_contacts
  FOR ALL USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));
CREATE TRIGGER trg_crm_contacts_updated BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. crm_products
CREATE TABLE public.crm_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  description text,
  category text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  billing_cycle public.crm_billing_cycle NOT NULL DEFAULT 'one_time',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage products" ON public.crm_products
  FOR ALL USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));
CREATE TRIGGER trg_crm_products_updated BEFORE UPDATE ON public.crm_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. crm_deals
CREATE TABLE public.crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  crm_organization_id uuid REFERENCES public.crm_organizations(id) ON DELETE SET NULL,
  primary_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  stage_id uuid NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  value numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  expected_close_date date,
  status public.crm_deal_status NOT NULL DEFAULT 'open',
  lost_reason text,
  won_at timestamptz,
  lost_at timestamptz,
  source text,
  notes text,
  linked_assignment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_deals_pipeline_stage ON public.crm_deals(pipeline_id, stage_id);
CREATE INDEX idx_crm_deals_org ON public.crm_deals(crm_organization_id);
CREATE INDEX idx_crm_deals_owner ON public.crm_deals(owner_user_id);
CREATE INDEX idx_crm_deals_status ON public.crm_deals(status);
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage deals" ON public.crm_deals
  FOR ALL USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));
CREATE TRIGGER trg_crm_deals_updated BEFORE UPDATE ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. crm_deal_products (line items)
CREATE TABLE public.crm_deal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.crm_products(id) ON DELETE RESTRICT,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_deal_products_deal ON public.crm_deal_products(deal_id);
ALTER TABLE public.crm_deal_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage deal products" ON public.crm_deal_products
  FOR ALL USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));
CREATE TRIGGER trg_crm_deal_products_updated BEFORE UPDATE ON public.crm_deal_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. crm_activities
CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.crm_activity_type NOT NULL,
  subject text NOT NULL,
  body text,
  due_at timestamptz,
  completed_at timestamptz,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  crm_organization_id uuid REFERENCES public.crm_organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_activities_deal ON public.crm_activities(deal_id);
CREATE INDEX idx_crm_activities_org ON public.crm_activities(crm_organization_id);
CREATE INDEX idx_crm_activities_contact ON public.crm_activities(contact_id);
CREATE INDEX idx_crm_activities_due ON public.crm_activities(due_at) WHERE completed_at IS NULL;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage activities" ON public.crm_activities
  FOR ALL USING (public.has_crm_access(auth.uid())) WITH CHECK (public.has_crm_access(auth.uid()));
CREATE TRIGGER trg_crm_activities_updated BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. crm_deal_stage_history
CREATE TABLE public.crm_deal_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id uuid REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_stage_hist_deal ON public.crm_deal_stage_history(deal_id, changed_at DESC);
ALTER TABLE public.crm_deal_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view stage history" ON public.crm_deal_stage_history
  FOR SELECT USING (public.has_crm_access(auth.uid()));
CREATE POLICY "CRM users insert stage history" ON public.crm_deal_stage_history
  FOR INSERT WITH CHECK (public.has_crm_access(auth.uid()));

-- 13. Auto-record stage changes on crm_deals
CREATE OR REPLACE FUNCTION public.record_crm_deal_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.crm_deal_stage_history (deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.id, OLD.stage_id, NEW.stage_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_crm_deal_stage_change AFTER UPDATE ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.record_crm_deal_stage_change();

-- 14. Two-way name sync: crm_organizations <-> organizations (loop-safe)
CREATE OR REPLACE FUNCTION public.sync_crm_org_name_to_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('crm.sync_in_progress', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.linked_org_id IS NOT NULL AND NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM set_config('crm.sync_in_progress', 'on', true);
    UPDATE public.organizations SET name = NEW.name, updated_at = now()
      WHERE id = NEW.linked_org_id AND name IS DISTINCT FROM NEW.name;
    PERFORM set_config('crm.sync_in_progress', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_crm_org_name AFTER UPDATE ON public.crm_organizations
  FOR EACH ROW EXECUTE FUNCTION public.sync_crm_org_name_to_admin();

CREATE OR REPLACE FUNCTION public.sync_admin_org_name_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('crm.sync_in_progress', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM set_config('crm.sync_in_progress', 'on', true);
    UPDATE public.crm_organizations SET name = NEW.name, updated_at = now()
      WHERE linked_org_id = NEW.id AND name IS DISTINCT FROM NEW.name;
    PERFORM set_config('crm.sync_in_progress', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_admin_org_name AFTER UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_org_name_to_crm();

-- 15. Seed default pipeline + 6 stages
DO $$
DECLARE
  pipeline_uuid uuid;
BEGIN
  INSERT INTO public.crm_pipelines (name, is_default, sort_order)
  VALUES ('Sales Pipeline', true, 0)
  RETURNING id INTO pipeline_uuid;

  INSERT INTO public.crm_pipeline_stages (pipeline_id, name, sort_order, win_probability, is_won, is_lost, color) VALUES
    (pipeline_uuid, 'Lead In',     0, 10,  false, false, 'hsl(210 40% 60%)'),
    (pipeline_uuid, 'Qualified',   1, 25,  false, false, 'hsl(190 70% 50%)'),
    (pipeline_uuid, 'Proposal',    2, 50,  false, false, 'hsl(45 90% 55%)'),
    (pipeline_uuid, 'Negotiation', 3, 75,  false, false, 'hsl(25 90% 55%)'),
    (pipeline_uuid, 'Won',         4, 100, true,  false, 'hsl(140 60% 45%)'),
    (pipeline_uuid, 'Lost',        5, 0,   false, true,  'hsl(0 70% 55%)');
END $$;