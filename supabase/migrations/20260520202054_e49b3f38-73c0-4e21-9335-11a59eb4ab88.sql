REVOKE EXECUTE ON FUNCTION public.get_audit_log_actors(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_log_actors(uuid) TO authenticated;