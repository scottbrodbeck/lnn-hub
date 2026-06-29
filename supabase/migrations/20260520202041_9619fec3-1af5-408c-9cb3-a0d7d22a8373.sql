-- 1. Change entity_id from uuid to text (heterogeneous IDs: uuid, numeric, composite)
DROP INDEX IF EXISTS public.idx_admin_audit_logs_entity;
ALTER TABLE public.admin_audit_logs ALTER COLUMN entity_id TYPE text USING entity_id::text;
CREATE INDEX idx_admin_audit_logs_entity ON public.admin_audit_logs (entity_type, entity_id);

-- 2. RPC: distinct actor_user_ids for an organization (admin-only, all rows)
CREATE OR REPLACE FUNCTION public.get_audit_log_actors(_organization_id uuid)
RETURNS TABLE(actor_user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT al.actor_user_id
  FROM public.admin_audit_logs al
  WHERE al.organization_id = _organization_id
    AND al.actor_user_id IS NOT NULL
    AND public.has_role(auth.uid(), 'admin'::app_role);
$$;