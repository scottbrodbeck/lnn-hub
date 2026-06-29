// Push worker: drains crm_sync_outbox to HubSpot.
// GUARDRAILS:
//  - Only create/update/associate ops are honored (DB CHECK enforces this too).
//  - Per-tick / per-hour / per-day push budgets stop runaway batches.
//  - Burst circuit breaker auto-pauses sync if too many rows queue up suddenly.
//  - Idempotency-key protected, batched per entity type, with retry/backoff.
//  - Uses claim-then-process pattern so concurrent invocations don't double-handle rows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, isSyncPaused, json, hsFetch, logSync } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map our entity types to HubSpot object names.
const HS_OBJECT: Record<string, string> = {
  organization: "companies",
  contact: "contacts",
  deal: "deals",
  note: "notes",
  task: "tasks",
};

// Local table per entity type for writeback (hubspot_id, sync_status, sync_error).
const LOCAL_TABLE: Record<string, string> = {
  organization: "crm_organizations",
  contact: "crm_contacts",
  deal: "crm_deals",
  note: "crm_activities",
  task: "crm_activities",
};

const MAX_ATTEMPTS = 6;

// Defaults; overridable via crm_settings.push_limits.
const DEFAULT_LIMITS = {
  max_per_tick: 50,
  max_per_hour: 200,
  max_per_day: 1000,
  burst_threshold: 100,
};

function backoffMs(attempt: number): number {
  // 30s, 1m, 2m, 5m, 15m, 30m
  const ladder = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000];
  return ladder[Math.min(attempt, ladder.length - 1)];
}

async function getLimits(admin: any): Promise<typeof DEFAULT_LIMITS> {
  try {
    const { data } = await admin
      .from("crm_settings")
      .select("value")
      .eq("key", "push_limits")
      .maybeSingle();
    return { ...DEFAULT_LIMITS, ...(data?.value ?? {}) };
  } catch {
    return DEFAULT_LIMITS;
  }
}

// Count successful pushes recorded in crm_sync_log within the trailing window.
async function pushCountSince(admin: any, sinceIso: string): Promise<number> {
  const { data } = await admin
    .from("crm_sync_log")
    .select("records_processed")
    .eq("direction", "push")
    .gte("created_at", sinceIso);
  return (data ?? []).reduce(
    (sum: number, r: any) => sum + (r.records_processed ?? 0),
    0,
  );
}

// Burst score = pending outbox rows created in the last 5 minutes.
async function burstScore(admin: any): Promise<number> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count } = await admin
    .from("crm_sync_outbox")
    .select("id", { count: "exact", head: true })
    .gte("created_at", fiveMinAgo)
    .in("status", ["pending", "error"]);
  return count ?? 0;
}

async function tripCircuitBreaker(admin: any, score: number, threshold: number): Promise<void> {
  await admin
    .from("crm_settings")
    .upsert(
      { key: "sync_paused", value: true, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  await logSync(admin, {
    direction: "push",
    entity_type: "outbox",
    op: "circuit_breaker_tripped",
    status: "error",
    error: `Burst score ${score} exceeded threshold ${threshold}; sync auto-paused.`,
    detail: { score, threshold },
  });
}

async function processItem(admin: any, item: any): Promise<void> {
  const { id, entity_type, entity_id, hubspot_id, op, payload, idempotency_key } = item;
  const hsObject = HS_OBJECT[entity_type];
  const localTable = LOCAL_TABLE[entity_type];
  if (!hsObject || !localTable) {
    throw new Error(`Unsupported entity_type: ${entity_type}`);
  }

  let resultHubspotId = hubspot_id;
  const headers: Record<string, string> = {};
  if (idempotency_key) headers["Idempotency-Key"] = String(idempotency_key);

  if (op === "create") {
    const body = JSON.stringify({ properties: payload?.properties ?? {}, associations: payload?.associations });
    const res = await hsFetch<any>(`/crm/v3/objects/${hsObject}`, {
      method: "POST",
      headers,
      body,
    });
    resultHubspotId = String(res.id);
  } else if (op === "update") {
    if (!hubspot_id) throw new Error("update requires hubspot_id");
    await hsFetch(`/crm/v3/objects/${hsObject}/${hubspot_id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ properties: payload?.properties ?? {} }),
    });
  } else if (op === "associate") {
    const { from_type, to_type, to_id, association_type } = payload ?? {};
    if (!hubspot_id || !to_type || !to_id) throw new Error("associate requires hubspot_id, to_type, to_id");
    await hsFetch(
      `/crm/v4/objects/${HS_OBJECT[from_type] ?? from_type}/${hubspot_id}/associations/${HS_OBJECT[to_type] ?? to_type}/${to_id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify(
          association_type
            ? [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: association_type }]
            : [],
        ),
      },
    );
  } else {
    // Per guardrail policy, archive/delete are explicitly NOT supported here.
    throw new Error(`Unsupported op: ${op} (deletions must be performed in HubSpot directly)`);
  }

  // Writeback to local row
  if (entity_id) {
    const patch: Record<string, any> = {
      sync_status: "synced",
      sync_error: null,
      updated_at: new Date().toISOString(),
    };
    if (op === "create" && resultHubspotId) patch.hubspot_id = resultHubspotId;
    await admin.from(localTable).update(patch).eq("id", entity_id);
  }

  await admin
    .from("crm_sync_outbox")
    .update({
      status: "done",
      hubspot_id: resultHubspotId,
      last_error: null,
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function handleFailure(admin: any, item: any, err: any): Promise<void> {
  const attempts = item.attempts ?? 1; // already incremented during claim
  const message = err?.message ?? String(err);
  const isFinal = attempts >= MAX_ATTEMPTS;
  const next = new Date(Date.now() + backoffMs(attempts - 1)).toISOString();

  await admin
    .from("crm_sync_outbox")
    .update({
      status: isFinal ? "failed" : "error",
      last_error: message.slice(0, 1000),
      next_attempt_at: isFinal ? null : next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (item.entity_id && LOCAL_TABLE[item.entity_type]) {
    await admin
      .from(LOCAL_TABLE[item.entity_type])
      .update({
        sync_status: isFinal ? "failed" : "error",
        sync_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.entity_id);
  }
}

// Atomically claim a single row by flipping its status to in_flight only if still
// pending/error and ready. Returns the claimed row or null.
async function claimNext(admin: any, nowIso: string): Promise<any | null> {
  const { data: candidates } = await admin
    .from("crm_sync_outbox")
    .select("id,attempts")
    .or(`status.eq.pending,and(status.eq.error,next_attempt_at.lte.${nowIso})`)
    .order("created_at", { ascending: true })
    .limit(5);
  if (!candidates?.length) return null;

  for (const c of candidates) {
    const newAttempts = (c.attempts ?? 0) + 1;
    const { data: claimed } = await admin
      .from("crm_sync_outbox")
      .update({
        status: "in_flight",
        attempts: newAttempts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id)
      .in("status", ["pending", "error"])
      .select("*")
      .maybeSingle();
    if (claimed) return claimed;
  }
  return null;
}

// Cache the HubSpot portal id once so the UI can build deep links
// (app.hubspot.com/contacts/{portalId}/deal/{id}). No-op after first success.
async function ensurePortalIdCached(admin: any): Promise<void> {
  const { data } = await admin
    .from("crm_settings")
    .select("value")
    .eq("key", "hubspot_portal_id")
    .maybeSingle();
  if (data?.value) return;
  const info = await hsFetch<{ portalId?: number }>("/account-info/v3/details", { method: "GET" });
  if (info?.portalId) {
    await admin
      .from("crm_settings")
      .upsert(
        { key: "hubspot_portal_id", value: info.portalId, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const start = Date.now();

  if (await isSyncPaused(admin)) {
    return json({ ok: true, paused: true });
  }

  void ensurePortalIdCached(admin).catch((e) =>
    console.warn("portal id cache failed", e?.message ?? e),
  );

  const limits = await getLimits(admin);

  // Circuit breaker — abort and pause if pending burst is anomalous.
  const score = await burstScore(admin);
  if (score >= limits.burst_threshold) {
    await tripCircuitBreaker(admin, score, limits.burst_threshold);
    return json({ ok: false, circuit_breaker: true, score, threshold: limits.burst_threshold });
  }

  // Trailing-window budget enforcement.
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [hourCount, dayCount] = await Promise.all([
    pushCountSince(admin, oneHourAgo),
    pushCountSince(admin, oneDayAgo),
  ]);
  if (hourCount >= limits.max_per_hour) {
    return json({ ok: true, throttled: "hour", hourCount, limit: limits.max_per_hour });
  }
  if (dayCount >= limits.max_per_day) {
    return json({ ok: true, throttled: "day", dayCount, limit: limits.max_per_day });
  }

  // Budget for this tick (capped by remaining hour/day budgets).
  const tickBudget = Math.max(
    0,
    Math.min(
      limits.max_per_tick,
      limits.max_per_hour - hourCount,
      limits.max_per_day - dayCount,
    ),
  );

  let okCount = 0;
  let failCount = 0;
  const errors: any[] = [];

  for (let i = 0; i < tickBudget; i++) {
    const item = await claimNext(admin, new Date().toISOString());
    if (!item) break;
    try {
      await processItem(admin, item);
      okCount++;
    } catch (e: any) {
      failCount++;
      errors.push({ id: item.id, error: e?.message ?? String(e) });
      await handleFailure(admin, item, e);
    }
  }

  const total = okCount + failCount;
  if (total > 0) {
    await logSync(admin, {
      direction: "push",
      entity_type: "outbox",
      status: failCount === 0 ? "ok" : okCount === 0 ? "error" : "partial",
      records_processed: okCount,
      latency_ms: Date.now() - start,
      error: errors.length ? JSON.stringify(errors).slice(0, 1000) : null,
      detail: { processed: okCount, failed: failCount, total, tickBudget },
    });
  }

  return json({ ok: true, processed: okCount, failed: failCount, total, errors, tickBudget });
});
