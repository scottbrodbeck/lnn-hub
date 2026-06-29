import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueOutbox } from './useOutboxEnqueue';
import { mapOrgToHs } from '@/lib/hubspotMappers';
import { buildCodePrefix, nextAvailableClientCode } from '@/lib/clientCode';

export type CrmOrg = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  address: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  owner_user_id: string | null;
  crm_owner_id: string | null;
  linked_org_id: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  qbo_customer_id?: string | null;
  qbo_customer_name?: string | null;
  qbo_balance?: number | null;
  qbo_currency?: string | null;
  qbo_active?: boolean | null;
  qbo_last_invoice_date?: string | null;
  qbo_last_payment_date?: string | null;
  qbo_balance_refreshed_at?: string | null;
  qbo_sync_error?: string | null;
};

export type CrmOrgWithStats = CrmOrg & {
  contacts_count: number;
  open_deals_count: number;
  open_value: number;
  linked_org_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
};

export type OrgsFilters = { search?: string; ownerId?: string; linked?: 'any' | 'yes' | 'no' };

export type OrgActivityFilter = 'any' | 'older_6mo';

export type OrgsPagedParams = OrgsFilters & {
  page: number;
  pageSize: number;
  sortKey?: 'name' | 'last_activity_at' | 'updated_at';
  sortDir?: 'asc' | 'desc';
  activityFilter?: OrgActivityFilter;
};

export type CrmOrgsPagedResult = { rows: CrmOrgWithStats[]; total: number };

export function useCrmOrganizationsPaged(params: OrgsPagedParams) {
  const { page, pageSize, search, ownerId, linked = 'any', sortKey = 'last_activity_at', sortDir = 'desc', activityFilter = 'any' } = params;
  return useQuery({
    queryKey: ['crm', 'organizations', 'paged', { page, pageSize, search: search ?? '', ownerId: ownerId ?? '', linked, sortKey, sortDir, activityFilter }],
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<CrmOrgsPagedResult> => {
      let q = supabase
        .from('crm_organizations')
        .select(
          `*,
          linked:organizations!crm_organizations_linked_org_id_fkey(id,name),
          owner:profiles!crm_organizations_owner_user_id_fkey(id,full_name,email),
          hs_owner:crm_owners!crm_organizations_crm_owner_id_fkey(id,full_name,email),
          contacts:crm_contacts(id),
          deals:crm_deals(id,status,value)`,
          { count: 'exact' }
        )
        .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false });

      if (search && search.trim()) {
        q = q.or(`name.ilike.%${search}%,website.ilike.%${search}%`);
      }
      if (ownerId === 'unassigned') q = q.is('owner_user_id', null);
      else if (ownerId) q = q.eq('owner_user_id', ownerId);
      if (linked === 'yes') q = q.not('linked_org_id', 'is', null);
      else if (linked === 'no') q = q.is('linked_org_id', null);

      if (activityFilter === 'older_6mo') {
        const sixMonthsAgoIso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30 * 6).toISOString();
        q = q.not('last_activity_at', 'is', null).lt('last_activity_at', sixMonthsAgoIso);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;

      const rows = (data ?? []).map((row: any) => {
        const openDeals = (row.deals ?? []).filter((d: any) => d.status === 'open');
        return {
          ...row,
          contacts_count: row.contacts?.length ?? 0,
          open_deals_count: openDeals.length,
          open_value: openDeals.reduce((s: number, d: any) => s + Number(d.value ?? 0), 0),
          linked_org_name: row.linked?.name ?? null,
          owner_name: row.hs_owner?.full_name ?? row.hs_owner?.email ?? row.owner?.full_name ?? row.owner?.email ?? null,
          owner_email: row.hs_owner?.email ?? row.owner?.email ?? null,
        };
      });
      return { rows, total: count ?? rows.length };
    },
  });
}

export function useCrmOrganizations(searchOrFilters?: string | OrgsFilters) {
  const filters: OrgsFilters =
    typeof searchOrFilters === 'string' || searchOrFilters === undefined
      ? { search: searchOrFilters as string | undefined }
      : searchOrFilters;
  return useQuery({
    queryKey: ['crm', 'organizations', filters.search ?? '', filters.ownerId ?? ''],
    queryFn: async (): Promise<CrmOrgWithStats[]> => {
      let q = supabase
        .from('crm_organizations')
        .select(
          `*,
          linked:organizations!crm_organizations_linked_org_id_fkey(id,name),
          owner:profiles!crm_organizations_owner_user_id_fkey(id,full_name,email),
          hs_owner:crm_owners!crm_organizations_crm_owner_id_fkey(id,full_name,email),
          contacts:crm_contacts(id),
          deals:crm_deals(id,status,value)`
        )
        .order('updated_at', { ascending: false });

      if (filters.search && filters.search.trim()) {
        q = q.or(`name.ilike.%${filters.search}%,website.ilike.%${filters.search}%`);
      }
      if (filters.ownerId === 'unassigned') q = q.is('owner_user_id', null);
      else if (filters.ownerId) q = q.eq('owner_user_id', filters.ownerId);

      const { data, error } = await q.range(0, 49999);
      if (error) throw error;

      return (data ?? []).map((row: any) => {
        const openDeals = (row.deals ?? []).filter((d: any) => d.status === 'open');
        return {
          ...row,
          contacts_count: row.contacts?.length ?? 0,
          open_deals_count: openDeals.length,
          open_value: openDeals.reduce((s: number, d: any) => s + Number(d.value ?? 0), 0),
          linked_org_name: row.linked?.name ?? null,
          owner_name: row.hs_owner?.full_name ?? row.hs_owner?.email ?? row.owner?.full_name ?? row.owner?.email ?? null,
          owner_email: row.hs_owner?.email ?? row.owner?.email ?? null,
        };
      });
    },
  });
}

export type CrmOrgLite = {
  id: string;
  name: string;
  qbo_customer_id: string | null;
};

/**
 * Lightweight, server-side search for org pickers.
 * - Empty query: returns the most recently updated `limit` orgs.
 * - Non-empty query: server-side ilike on name/website, capped at `limit`.
 * Selects only id/name/qbo_customer_id to avoid PostgREST max-rows truncation
 * that the full `useCrmOrganizations` hook hits when used as a picker source.
 */
export function useCrmOrganizationsSearch(query: string, opts?: { limit?: number }) {
  const limit = opts?.limit ?? 50;
  const q = (query ?? '').trim();
  return useQuery({
    queryKey: ['crm', 'organizations', 'search', q, limit],
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    queryFn: async (): Promise<CrmOrgLite[]> => {
      let req = supabase
        .from('crm_organizations')
        .select('id, name, qbo_customer_id')
        .order(q ? 'name' : 'updated_at', { ascending: !!q, nullsFirst: false })
        .limit(limit);
      if (q) {
        req = req.or(`name.ilike.%${q}%,website.ilike.%${q}%`);
      }
      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as CrmOrgLite[];
    },
  });
}

export function useCrmOrganization(id?: string) {
  return useQuery({
    queryKey: ['crm', 'organization', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_organizations')
        .select(
          `*,
          linked:organizations!crm_organizations_linked_org_id_fkey(id,name),
          owner:profiles!crm_organizations_owner_user_id_fkey(id,full_name,email)`
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCrmOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CrmOrg>) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('crm_organizations')
        .insert({
          name: input.name!,
          website: input.website ?? null,
          industry: input.industry ?? null,
          size: input.size ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          source: input.source ?? null,
          notes: input.notes ?? null,
          tags: input.tags ?? [],
          owner_user_id: input.owner_user_id ?? u.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      await enqueueOutbox({
        entity_type: 'organization',
        entity_id: data.id,
        op: 'create',
        payload: { properties: mapOrgToHs(data) },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      toast.success('Organization created');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCrmOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmOrg> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_organizations')
        .update(patch)
        .eq('id', id)
        .select('*, hubspot_id')
        .single();
      if (error) throw error;

      if ((data as any).hubspot_id) {
        await enqueueOutbox({
          entity_type: 'organization',
          entity_id: id,
          hubspot_id: (data as any).hubspot_id,
          op: 'update',
          payload: { properties: mapOrgToHs(data) },
        });
      }
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      qc.invalidateQueries({ queryKey: ['crm', 'organization', vars.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteCrmOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from('crm_deals')
        .select('id', { count: 'exact', head: true })
        .eq('crm_organization_id', id)
        .eq('status', 'open');
      if ((count ?? 0) > 0) throw new Error('Cannot delete: organization has open deals');

      // Per policy: deletes are local-only. HubSpot company record is preserved.
      const { error } = await supabase.from('crm_organizations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      toast.success('Organization removed from workspace. To archive in HubSpot, do so there directly.');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/**
 * One-time: if the CRM org's HubSpot owner email matches a local admin/super_admin user,
 * copy that user into organizations.sales_rep_user_id (only when currently empty).
 * No ongoing sync — runs only when an admin client link is established.
 */
async function applySalesRepFromHubspotOwner(
  crmOrgId: string,
  adminOrgId: string,
): Promise<{ name: string | null } | null> {
  // 1. CRM org → owner row
  const { data: crmOrg } = await supabase
    .from('crm_organizations')
    .select('crm_owner_id, owner:crm_owners!crm_organizations_crm_owner_id_fkey(id, email, full_name)')
    .eq('id', crmOrgId)
    .maybeSingle();
  const ownerEmail = (crmOrg as any)?.owner?.email as string | undefined;
  if (!ownerEmail) return null;

  // 2. Match against profile + admin/super_admin role
  const { data: prof } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .ilike('email', ownerEmail)
    .maybeSingle();
  if (!prof) return null;
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', prof.id)
    .in('role', ['admin', 'super_admin'] as any)
    .maybeSingle();
  if (!roleRow) return null;

  // 3. Set only when sales_rep_user_id is currently empty
  const { data: updated, error } = await supabase
    .from('organizations')
    .update({ sales_rep_user_id: prof.id })
    .eq('id', adminOrgId)
    .is('sales_rep_user_id', null)
    .select('id')
    .maybeSingle();
  if (error || !updated) return null;
  return { name: prof.full_name ?? prof.email };
}

export function useLinkAdminClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ crmOrgId, adminOrgId }: { crmOrgId: string; adminOrgId: string | null }) => {
      const { error } = await supabase
        .from('crm_organizations')
        .update({ linked_org_id: adminOrgId })
        .eq('id', crmOrgId);
      if (error) throw error;

      let copied: { name: string | null } | null = null;
      if (adminOrgId) {
        copied = await applySalesRepFromHubspotOwner(crmOrgId, adminOrgId);
      }
      return { copied };
    },
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      qc.invalidateQueries({ queryKey: ['crm', 'organization', vars.crmOrgId] });
      qc.invalidateQueries({ queryKey: ['qbo', 'assignment-plan'] });
      toast.success('Link updated');
      if (res?.copied?.name) {
        toast.success(`Sales Rep set to ${res.copied.name}`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreateAdminClientFromCrm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (crmOrg: CrmOrg) => {
      const clientCode = await nextAvailableClientCode(buildCodePrefix(crmOrg.name || 'org'));
      const { data: newOrg, error } = await supabase
        .from('organizations')
        .insert({ name: crmOrg.name, client_code: clientCode })
        .select()
        .single();
      if (error) throw error;
      const { error: linkErr } = await supabase
        .from('crm_organizations')
        .update({ linked_org_id: newOrg.id })
        .eq('id', crmOrg.id);
      if (linkErr) throw linkErr;

      const copied = await applySalesRepFromHubspotOwner(crmOrg.id, newOrg.id);
      return { newOrg, copied };
    },
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'organizations'] });
      qc.invalidateQueries({ queryKey: ['crm', 'organization', vars.id] });
      qc.invalidateQueries({ queryKey: ['qbo', 'assignment-plan'] });
      toast.success('Admin client created and linked');
      if (res?.copied?.name) {
        toast.success(`Sales Rep set to ${res.copied.name}`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAdminOrganizationsLite() {
  return useQuery({
    queryKey: ['admin', 'organizations', 'lite'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id,name,client_code')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}
