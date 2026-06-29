ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS sales_rep_user_id uuid;
CREATE INDEX IF NOT EXISTS idx_organizations_sales_rep_user_id ON public.organizations(sales_rep_user_id);

ALTER TABLE public.crm_organizations ADD COLUMN IF NOT EXISTS crm_owner_id uuid REFERENCES public.crm_owners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_organizations_crm_owner_id ON public.crm_organizations(crm_owner_id);