import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  diff: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: { id: string; full_name: string | null; email: string | null } | null;
}

export interface AuditLogFilters {
  organizationId: string;
  page?: number;
  pageSize?: number;
  actorUserId?: string | null;
  entityType?: string | null;
  search?: string | null;
  /** Days back from now */
  sinceDays?: number | null;
}

export function useAuditLog(filters: AuditLogFilters) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 25;
  const {
    organizationId,
    actorUserId = null,
    entityType = null,
    search = null,
    sinceDays = null,
  } = filters;

  return useQuery({
    queryKey: [
      'audit-log',
      organizationId,
      page,
      pageSize,
      entityType ?? null,
      actorUserId ?? null,
      search ?? null,
      sinceDays ?? null,
    ],
    enabled: !!organizationId,
    queryFn: async () => {
      let q = supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (actorUserId) q = q.eq('actor_user_id', actorUserId);
      if (entityType) q = q.eq('entity_type', entityType);
      if (search) q = q.ilike('summary', `%${search}%`);
      if (sinceDays) {
        const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
        q = q.gte('created_at', since);
      }

      const { data, error, count } = await q;
      if (error) throw error;

      const rows = (data ?? []) as AuditLogEntry[];
      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_user_id).filter((x): x is string => !!x))
      );

      const actors: Record<string, AuditLogEntry['actor']> = {};
      if (actorIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', actorIds);
        for (const p of profiles ?? []) {
          actors[p.id] = { id: p.id, full_name: p.full_name, email: p.email };
        }
      }

      return {
        entries: rows.map((r) => ({ ...r, actor: r.actor_user_id ? actors[r.actor_user_id] ?? null : null })),
        total: count ?? 0,
        page,
        pageSize,
      };
    },
  });
}

export interface AuditActor {
  id: string;
  full_name: string | null;
  email: string | null;
}

/**
 * Distinct actors who have logged actions for this organization,
 * for use in the AuditLogTab actor dropdown. Uses an admin-gated RPC
 * so the dropdown isn't bounded by the most recent N rows.
 */
export function useAuditActors(organizationId: string) {
  return useQuery({
    queryKey: ['audit-log-actors', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<AuditActor[]> => {
      const { data, error } = await supabase.rpc('get_audit_log_actors', {
        _organization_id: organizationId,
      });
      if (error) throw error;

      const ids = Array.from(
        new Set(
          (data ?? [])
            .map((r: { actor_user_id: string | null }) => r.actor_user_id)
            .filter((x: string | null): x is string => !!x)
        )
      );
      if (ids.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);

      return (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
      }));
    },
  });
}
