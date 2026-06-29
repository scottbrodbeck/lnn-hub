-- Audit log for admin actions taken per client/organization
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  summary text NOT NULL,
  diff jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_logs_org_created
  ON public.admin_audit_logs (organization_id, created_at DESC);

CREATE INDEX idx_admin_audit_logs_entity
  ON public.admin_audit_logs (entity_type, entity_id);

CREATE INDEX idx_admin_audit_logs_actor
  ON public.admin_audit_logs (actor_user_id);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Monthly retention: delete entries older than 12 months
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'admin-audit-logs-retention',
  '0 4 1 * *',
  $$DELETE FROM public.admin_audit_logs WHERE created_at < now() - interval '12 months'$$
);