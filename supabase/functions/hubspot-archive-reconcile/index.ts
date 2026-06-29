// Reconcile HubSpot archives → local hard-deletes.
// Pulls archived contacts/companies from HubSpot and removes the matching
// local crm_contacts / crm_organizations rows. Never writes to HubSpot.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, hsFetch, json } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Entity = "contact" | "company" | "both";

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("missing auth");
  const sb = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) throw new Error("unauthenticated");
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id);
  const allowed = (roles ?? []).some((r: any) =>
    ["admin", "super_admin"].includes(r.role),
  );
  if (!allowed) throw new Error("forbidden");
  return { user: u.user, admin };
}

// Page through archived objects from HubSpot. Returns just the IDs (string).
async function fetchArchivedIds(
  object: "contacts" | "companies",
  maxPages = 100,
): Promise<{ ids: string[]; truncated: boolean }> {
  const ids: string[] = [];
  let after: string | undefined;
  let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      archived: "true",
      limit: "100",
    });
    if (after) params.set("after", after);
    const data = await hsFetch<any>(
      `/crm/v3/objects/${object}?${params.toString()}`,
    );
    for (const r of data.results ?? []) {
      if (r?.id) ids.push(String(r.id));
    }
    after = data?.paging?.next?.after;
    if (!after) return { ids, truncated: false };
  }
  truncated = true;
  return { ids, truncated };
}

type MatchRow = {
  id: string;
  hubspot_id: string;
  label: string;
  email?: string | null;
  has_links?: boolean;
};

async function findLocalMatches(
  admin: any,
  table: "crm_contacts" | "crm_organizations",
  archivedIds: string[],
): Promise<MatchRow[]> {
  if (archivedIds.length === 0) return [];
  // Chunk to avoid massive .in() lists.
  const out: MatchRow[] = [];
  const CHUNK = 500;
  for (let i = 0; i < archivedIds.length; i += CHUNK) {
    const slice = archivedIds.slice(i, i + CHUNK);
    if (table === "crm_contacts") {
      const { data, error } = await admin
        .from("crm_contacts")
        .select("id,hubspot_id,first_name,last_name,email")
        .in("hubspot_id", slice);
      if (error) throw error;
      for (const r of data ?? []) {
        const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
        out.push({
          id: r.id,
          hubspot_id: r.hubspot_id,
          label: name || r.email || "(no name)",
          email: r.email,
        });
      }
    } else {
      const { data, error } = await admin
        .from("crm_organizations")
        .select("id,hubspot_id,name")
        .in("hubspot_id", slice);
      if (error) throw error;
      for (const r of data ?? []) {
        out.push({
          id: r.id,
          hubspot_id: r.hubspot_id,
          label: r.name || "(unnamed)",
        });
      }
    }
  }
  return out;
}

// Count rows in deals/activities that reference any of these contact/org ids.
async function countLinks(
  admin: any,
  kind: "contact" | "organization",
  matches: MatchRow[],
): Promise<number> {
  if (matches.length === 0) return 0;
  const ids = matches.map((m) => m.id);
  const dealsCol = kind === "contact" ? "primary_contact_id" : "crm_organization_id";
  const actCol = kind === "contact" ? "contact_id" : "crm_organization_id";
  const [deals, acts] = await Promise.all([
    admin.from("crm_deals").select("id", { count: "exact", head: true }).in(dealsCol, ids),
    admin.from("crm_activities").select("id", { count: "exact", head: true }).in(actCol, ids),
  ]);
  return (deals.count ?? 0) + (acts.count ?? 0);
}

async function deleteOutboxFor(
  admin: any,
  entity_type: "contact" | "organization",
  matches: MatchRow[],
) {
  if (matches.length === 0) return 0;
  const ids = matches.map((m) => m.id);
  // status filter is defensive; we drop pending/error rows so the push worker
  // doesn't try to PATCH a record HubSpot already archived.
  const { count, error } = await admin
    .from("crm_sync_outbox")
    .delete({ count: "exact" })
    .eq("entity_type", entity_type)
    .in("status", ["pending", "error", "in_flight"])
    .in("entity_id", ids);
  if (error) throw error;
  return count ?? 0;
}

async function deleteLocal(
  admin: any,
  table: "crm_contacts" | "crm_organizations",
  matches: MatchRow[],
): Promise<number> {
  if (matches.length === 0) return 0;
  const ids = matches.map((m) => m.id);
  const CHUNK = 200;
  let total = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { count, error } = await admin
      .from(table)
      .delete({ count: "exact" })
      .in("id", slice);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action: "scan" | "reconcile" = body.action ?? "scan";
    const entity: Entity = (body.entity as Entity) ?? "both";
    const dryRun: boolean = !!body.dryRun;

    const wantContacts = entity === "contact" || entity === "both";
    const wantOrgs = entity === "company" || entity === "both";

    // 1. Pull archived IDs from HubSpot.
    const t0 = Date.now();
    const [hsContacts, hsOrgs] = await Promise.all([
      wantContacts ? fetchArchivedIds("contacts") : Promise.resolve({ ids: [], truncated: false }),
      wantOrgs ? fetchArchivedIds("companies") : Promise.resolve({ ids: [], truncated: false }),
    ]);

    // 2. Intersect with local rows.
    const contactMatches = wantContacts
      ? await findLocalMatches(admin, "crm_contacts", hsContacts.ids)
      : [];
    const orgMatches = wantOrgs
      ? await findLocalMatches(admin, "crm_organizations", hsOrgs.ids)
      : [];

    const [contactLinks, orgLinks] = await Promise.all([
      countLinks(admin, "contact", contactMatches),
      countLinks(admin, "organization", orgMatches),
    ]);

    const preview = {
      contacts: contactMatches.slice(0, 500),
      organizations: orgMatches.slice(0, 500),
      totals: {
        archived_in_hubspot: {
          contacts: hsContacts.ids.length,
          organizations: hsOrgs.ids.length,
        },
        matched_locally: {
          contacts: contactMatches.length,
          organizations: orgMatches.length,
        },
        linked_records: {
          contacts: contactLinks,
          organizations: orgLinks,
        },
        truncated: hsContacts.truncated || hsOrgs.truncated,
      },
      scan_ms: Date.now() - t0,
    };

    if (action === "scan" || dryRun) {
      return json({ ok: true, action: "scan", ...preview });
    }

    // 3. Reconcile = clear pending outbox + hard-delete local rows.
    const t1 = Date.now();
    const outboxContacts = await deleteOutboxFor(admin, "contact", contactMatches);
    const outboxOrgs = await deleteOutboxFor(admin, "organization", orgMatches);
    const deletedContacts = await deleteLocal(admin, "crm_contacts", contactMatches);
    const deletedOrgs = await deleteLocal(admin, "crm_organizations", orgMatches);

    // 4. Audit log.
    await admin.from("crm_sync_log").insert({
      direction: "pull",
      entity_type: "archive_reconcile",
      op: "archive-reconcile",
      status: "ok",
      records_processed: deletedContacts + deletedOrgs,
      latency_ms: Date.now() - t1,
      detail: {
        triggered_by: user.id,
        deleted: { contacts: deletedContacts, organizations: deletedOrgs },
        outbox_cleared: { contacts: outboxContacts, organizations: outboxOrgs },
        archived_in_hubspot: preview.totals.archived_in_hubspot,
        truncated: preview.totals.truncated,
      },
    });

    return json({
      ok: true,
      action: "reconcile",
      ...preview,
      deleted: { contacts: deletedContacts, organizations: deletedOrgs },
      outbox_cleared: { contacts: outboxContacts, organizations: outboxOrgs },
      reconcile_ms: Date.now() - t1,
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "forbidden" ? 403 : msg === "unauthenticated" || msg === "missing auth" ? 401 : 500;
    return json({ ok: false, error: msg }, status);
  }
});
