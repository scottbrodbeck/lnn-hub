// One-time admin backfill orchestrator.
// Body: { action: 'start' | 'status' | 'reset', objects?: string[] }
// On 'start' we clear the watermark for each requested object and invoke its pull worker once.
// Because pull workers paginate up to 50*100=5000 records per call, large portals require
// repeated 'continue' calls (the UI will poll status and re-issue start until processed_total stops growing).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, json } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALL_OBJECTS = [
  "owners",
  "pipelines",
  "companies",
  "contacts",
  "deals",
  "engagements_notes",
  "engagements_emails",
  "engagements_calls",
  "engagements_meetings",
  "engagements_tasks",
];

// All engagement subtypes share one worker which pulls every subtype in a single call.
const WORKER: Record<string, string> = {
  owners: "crm-hubspot-pull-owners",
  pipelines: "crm-hubspot-pull-pipelines",
  companies: "crm-hubspot-pull-companies",
  contacts: "crm-hubspot-pull-contacts",
  deals: "crm-hubspot-pull-deals",
  engagements_notes: "crm-hubspot-pull-engagements",
  engagements_emails: "crm-hubspot-pull-engagements",
  engagements_calls: "crm-hubspot-pull-engagements",
  engagements_meetings: "crm-hubspot-pull-engagements",
  engagements_tasks: "crm-hubspot-pull-engagements",
};

// For row-count display: engagement subtypes all live in crm_activities and are
// distinguished by engagement_type. Counts are computed below with a filter.
const TABLE: Record<string, string | null> = {
  owners: "crm_owners",
  pipelines: "crm_pipelines",
  companies: "crm_organizations",
  contacts: "crm_contacts",
  deals: "crm_deals",
  engagements_notes: "crm_activities",
  engagements_emails: "crm_activities",
  engagements_calls: "crm_activities",
  engagements_meetings: "crm_activities",
  engagements_tasks: "crm_activities",
};

// Map sync-state key → engagement_type filter value used in crm_activities.
const ENGAGEMENT_TYPE_FILTER: Record<string, string> = {
  engagements_notes: "note",
  engagements_emails: "email",
  engagements_calls: "call",
  engagements_meetings: "meeting",
  engagements_tasks: "task",
};

// Fire-and-forget invoke: don't await body so we don't hit edge function timeouts
// when a backfill chain takes minutes. The UI polls 'status' to track progress.
function invokeAsync(name: string): void {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  }).catch(() => { /* swallow; status endpoint surfaces errors */ });
}

async function tableCount(
  admin: any,
  table: string | null,
  engagementTypeFilter?: string,
): Promise<number> {
  if (!table) return 0;
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (engagementTypeFilter) q = q.eq("engagement_type", engagementTypeFilter);
  const { count } = await q;
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth: require admin/super_admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "Unauthorized" }, 401);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id);
  const isAdmin = (roles ?? []).some((r: any) => ["admin", "super_admin"].includes(r.role));
  if (!isAdmin) return json({ error: "Admin role required" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = (body.action ?? "status") as "start" | "status" | "reset" | "continue";
  const objects: string[] = Array.isArray(body.objects) && body.objects.length
    ? body.objects.filter((o: string) => ALL_OBJECTS.includes(o))
    : ALL_OBJECTS;

  if (action === "reset") {
    // Clear watermarks so next pull becomes a full backfill from epoch.
    for (const obj of objects) {
      await admin
        .from("crm_sync_state")
        .upsert(
          { object_type: obj, last_modified_watermark: null, last_full_reconcile_at: null, updated_at: new Date().toISOString() },
          { onConflict: "object_type" },
        );
    }
    return json({ ok: true, reset: objects });
  }

  if (action === "start" || action === "continue") {
    // Guardrail: backfill must be explicitly confirmed and acknowledge an expected
    // upper-bound count of records that will be touched. The orchestrator only
    // *pulls* from HubSpot (it does not push), so this is a soft check that
    // forces the admin to acknowledge the scale of what they're triggering.
    const confirm = body.confirm === true;
    const expectedCount = typeof body.expected_count === "number" ? body.expected_count : null;
    if (!confirm) {
      return json(
        {
          error: "Backfill requires explicit confirmation. Send { confirm: true, expected_count: <number> }.",
        },
        400,
      );
    }
    if (expectedCount === null) {
      return json(
        { error: "Backfill requires { expected_count: <number> } as a safety acknowledgement." },
        400,
      );
    }

    // Dedupe: the engagements worker pulls all 5 subtypes in a single call,
    // so we only need to invoke each unique worker name once per request.
    const triggered: string[] = [];
    const invoked = new Set<string>();
    for (const obj of objects) {
      const worker = WORKER[obj];
      if (!worker || invoked.has(worker)) {
        triggered.push(obj);
        continue;
      }
      invokeAsync(worker);
      invoked.add(worker);
      triggered.push(obj);
    }
    return json({
      ok: true,
      triggered,
      expected_count: expectedCount,
      note: "Workers running in background. Poll 'status' for progress.",
    });
  }

  // status: return per-object counts + watermark + last run
  const status: Record<string, any> = {};
  const { data: states } = await admin
    .from("crm_sync_state")
    .select("*")
    .in("object_type", objects);
  const stateMap = new Map((states ?? []).map((s: any) => [s.object_type, s]));
  for (const obj of objects) {
    const count = await tableCount(admin, TABLE[obj], ENGAGEMENT_TYPE_FILTER[obj]);
    const s: any = stateMap.get(obj);
    status[obj] = {
      table: TABLE[obj],
      row_count: count,
      watermark: s?.last_modified_watermark ?? null,
      last_run_at: s?.last_run_at ?? null,
      last_run_status: s?.last_run_status ?? null,
      last_error: s?.last_error ?? null,
      records_processed: s?.records_processed ?? 0,
    };
  }
  return json({ ok: true, status });
});
