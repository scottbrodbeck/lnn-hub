// Dispatcher: invokes pull workers in dependency order.
// Called every 2 minutes by pg_cron. Owners and pipelines run on a slower cadence
// (skipped on most ticks based on last_run_at).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, isSyncPaused, json, logSync } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function shouldRun(admin: any, key: string, intervalMs: number): Promise<boolean> {
  const { data } = await admin
    .from("crm_sync_state")
    .select("last_run_at")
    .eq("object_type", key)
    .maybeSingle();
  if (!data?.last_run_at) return true;
  return Date.now() - new Date(data.last_run_at).getTime() >= intervalMs;
}

async function invoke(name: string, query = ""): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/${name}${query}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
}

// Cycle relink targets across ticks so any single tick stays fast.
// One entity per tick → full sweep every ~6 minutes.
const RELINK_ROTATION = ["contacts", "deals_companies", "deals_contacts"] as const;
function pickRelinkEntity(): string {
  const minute = Math.floor(Date.now() / 60000);
  return RELINK_ROTATION[minute % RELINK_ROTATION.length];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const start = Date.now();
  const summary: Record<string, any> = {};

  if (await isSyncPaused(admin)) {
    return json({ ok: true, paused: true });
  }

  // Quiet hours: 00:00–06:00 America/New_York. Skip all inbound pulls;
  // still drain the push outbox so user-driven writes propagate.
  const etHourRaw = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
  // en-US with hour12:false returns "24" at midnight; normalize to 0.
  const etHour = etHourRaw === 24 ? 0 : etHourRaw;
  const inQuietHours = etHour >= 0 && etHour < 6;

  if (inQuietHours) {
    summary.quiet_hours = { et_hour: etHour, skipped_pulls: true };
    summary.push = await invoke("crm-hubspot-push");
    await logSync(admin, {
      direction: "pull",
      entity_type: "tick",
      status: "ok",
      latency_ms: Date.now() - start,
      detail: summary,
    });
    return json({ ok: true, quiet_hours: true, summary });
  }

  try {
    // Owners: every 10 minutes
    if (await shouldRun(admin, "owners", 10 * 60 * 1000)) {
      summary.owners = await invoke("crm-hubspot-pull-owners");
    } else summary.owners = { skipped: true };

    // Pipelines: every 30 minutes
    if (await shouldRun(admin, "pipelines", 30 * 60 * 1000)) {
      summary.pipelines = await invoke("crm-hubspot-pull-pipelines");
    } else summary.pipelines = { skipped: true };

    // Companies and contacts and deals: every tick (~2 min)
    summary.companies = await invoke("crm-hubspot-pull-companies");
    summary.contacts = await invoke("crm-hubspot-pull-contacts");
    summary.deals = await invoke("crm-hubspot-pull-deals");

    // Engagements: every 5 minutes (use a single dispatcher-level lock key
    // since the worker writes per-type sub-keys internally).
    if (await shouldRun(admin, "engagements_dispatch", 5 * 60 * 1000)) {
      summary.engagements = await invoke("crm-hubspot-pull-engagements");
      // Track dispatcher-level run timestamp.
      await admin.from("crm_sync_state").upsert(
        { object_type: "engagements_dispatch", last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "object_type" },
      );
    } else summary.engagements = { skipped: true };

    // Push outbox every tick (drains any queued local writes).
    summary.push = await invoke("crm-hubspot-push");

    // Relink one entity per tick to backfill missing FK links from HubSpot
    // associations. Self-throttling: when nothing is left to link, runs are
    // cheap (one DB scan + zero-row HubSpot batch) and quickly complete.
    const relinkEntity = pickRelinkEntity();
    summary.relink = {
      entity: relinkEntity,
      ...(await invoke("crm-hubspot-relink", `?entity=${relinkEntity}`)),
    };
    await logSync(admin, {
      direction: "pull",
      entity_type: "tick",
      status: "ok",
      latency_ms: Date.now() - start,
      detail: summary,
    });
    return json({ ok: true, summary });
  } catch (e: any) {
    await logSync(admin, {
      direction: "pull",
      entity_type: "tick",
      status: "error",
      latency_ms: Date.now() - start,
      error: e?.message ?? String(e),
      detail: summary,
    });
    return json({ ok: false, error: e?.message ?? String(e), summary }, 500);
  }
});
